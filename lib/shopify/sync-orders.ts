import { supabaseService } from "@/lib/supabase/service-client";
import { paginateAll } from "./client";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/sync-orders.ts must never be imported into client code");
}

export interface SyncOrdersResult {
  pulledCount: number;
  importedCount: number;
  errors: string[];
}

function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

const QUERY = `
  query($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id name email phone createdAt processedAt cancelledAt cancelReason
          displayFinancialStatus displayFulfillmentStatus currencyCode note tags
          customer { id }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 100) {
            edges { node { id title quantity sku variant { id } product { id } originalUnitPriceSet { shopMoney { amount currencyCode } } discountedUnitPriceSet { shopMoney { amount currencyCode } } } }
          }
          transactions(first: 10) { id kind status gateway amountSet { shopMoney { amount currencyCode } } processedAt }
          fulfillments(first: 10) { id status createdAt trackingInfo { number url company } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

/**
 * Next.js-native equivalent of scripts/shopify/import-missing-orders.ts, callable from the admin
 * "Sync from Shopify" button (app/api/admin/orders/sync/route.ts). Same idempotent shopify_id-
 * keyed upsert pipeline, just via supabase-js's .upsert() instead of the CLI scripts' raw
 * PostgREST helper. Runs on this app's own, restricted (read_orders-only) Shopify token in
 * production -- it only ever sees orders from the last ~60 days (see
 * docs/order-reconciliation-report.md §4), so it catches new orders going forward; it does not
 * redo the one-time historical backfill that import-mcp-backfill-orders.ts already did once.
 */
export async function syncOrdersFromShopify(): Promise<SyncOrdersResult> {
  const orders: any[] = [];
  await paginateAll(QUERY, (d: any) => d.orders, async (nodes) => void orders.push(...nodes), 50);

  const errors: string[] = [];
  let importedCount = 0;

  const { data: customers } = await supabaseService.from("customers").select("id, shopify_id");
  const customerIdByShopify = new Map((customers ?? []).filter((c) => c.shopify_id).map((c) => [c.shopify_id, c.id]));
  const { data: products } = await supabaseService.from("products").select("id, shopify_id");
  const productIdByShopify = new Map((products ?? []).filter((p) => p.shopify_id).map((p) => [p.shopify_id, p.id]));
  const { data: variants } = await supabaseService.from("product_variants").select("id, shopify_id");
  const variantIdByShopify = new Map((variants ?? []).filter((v) => v.shopify_id).map((v) => [v.shopify_id, v.id]));

  for (const o of orders) {
    const sid = idTail(o.id)!;
    try {
      const { data: upsertedOrder, error: orderError } = await supabaseService
        .from("orders")
        .upsert(
          {
            shopify_id: sid,
            source: "shopify",
            customer_id: o.customer ? customerIdByShopify.get(idTail(o.customer.id)!) ?? null : null,
            order_number: o.name,
            email: o.email || null,
            phone: o.phone || null,
            currency_code: o.currencyCode,
            financial_status: o.displayFinancialStatus || null,
            fulfillment_status: o.displayFulfillmentStatus || null,
            subtotal_price: o.subtotalPriceSet ? Number(o.subtotalPriceSet.shopMoney.amount) : null,
            total_shipping: o.totalShippingPriceSet ? Number(o.totalShippingPriceSet.shopMoney.amount) : null,
            total_tax: o.totalTaxSet ? Number(o.totalTaxSet.shopMoney.amount) : null,
            total_discounts: o.totalDiscountsSet ? Number(o.totalDiscountsSet.shopMoney.amount) : null,
            total_price: Number(o.totalPriceSet.shopMoney.amount),
            note: o.note || null,
            tags: o.tags || [],
            cancelled_at: o.cancelledAt || null,
            cancel_reason: o.cancelReason || null,
            processed_at: o.processedAt || null,
            created_at: o.createdAt,
          },
          { onConflict: "shopify_id" }
        )
        .select("id")
        .single();
      if (orderError || !upsertedOrder) throw new Error(orderError?.message ?? "upsert failed");

      const itemRows = o.lineItems.edges.map((edge: any) => {
        const li = edge.node;
        return {
          shopify_id: idTail(li.id),
          order_id: upsertedOrder.id,
          variant_id: li.variant ? variantIdByShopify.get(idTail(li.variant.id)!) ?? null : null,
          product_id: li.product ? productIdByShopify.get(idTail(li.product.id)!) ?? null : null,
          title: li.title,
          sku: li.sku || null,
          quantity: li.quantity,
          unit_price: Number(li.originalUnitPriceSet.shopMoney.amount),
          discounted_unit_price: li.discountedUnitPriceSet ? Number(li.discountedUnitPriceSet.shopMoney.amount) : null,
        };
      });
      if (itemRows.length) await supabaseService.from("order_items").upsert(itemRows, { onConflict: "shopify_id" });

      const paymentRows = (o.transactions ?? []).map((tx: any) => ({
        shopify_id: idTail(tx.id),
        order_id: upsertedOrder.id,
        kind: tx.kind || null,
        status: tx.status || null,
        gateway: tx.gateway || null,
        amount: tx.amountSet ? Number(tx.amountSet.shopMoney.amount) : null,
        currency_code: tx.amountSet?.shopMoney.currencyCode ?? null,
        processed_at: tx.processedAt || null,
      }));
      if (paymentRows.length) await supabaseService.from("payments").upsert(paymentRows, { onConflict: "shopify_id" });

      const fulfillmentRows = (o.fulfillments ?? []).map((f: any) => {
        const tracking = f.trackingInfo?.[0];
        return {
          shopify_id: idTail(f.id),
          order_id: upsertedOrder.id,
          status: f.status || null,
          tracking_number: tracking?.number || null,
          tracking_url: tracking?.url || null,
          tracking_company: tracking?.company || null,
          created_at: f.createdAt,
        };
      });
      if (fulfillmentRows.length) await supabaseService.from("fulfillments").upsert(fulfillmentRows, { onConflict: "shopify_id" });

      importedCount += 1;
    } catch (err) {
      errors.push(`${o.name}: ${(err as Error).message}`);
    }
  }

  return { pulledCount: orders.length, importedCount, errors };
}
