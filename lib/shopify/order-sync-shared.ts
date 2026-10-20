import { supabaseService } from "@/lib/supabase/service-client";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { getOrderItemImages } from "@/lib/order-images";
import { shopifyGraphQL } from "./client";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/order-sync-shared.ts must never be imported into client code");
}

function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

export type ShopifyOrderNode = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  note: string | null;
  tags: string[];
  customer: { id: string } | null;
  subtotalPriceSet: { shopMoney: { amount: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string } } | null;
  totalTaxSet: { shopMoney: { amount: string } } | null;
  totalDiscountsSet: { shopMoney: { amount: string } } | null;
  totalPriceSet: { shopMoney: { amount: string } };
  lineItems: {
    edges: {
      node: {
        id: string;
        title: string;
        quantity: number;
        sku: string | null;
        variant: { id: string } | null;
        product: { id: string } | null;
        originalUnitPriceSet: { shopMoney: { amount: string } };
        discountedUnitPriceSet: { shopMoney: { amount: string } } | null;
      };
    }[];
  };
  transactions: {
    id: string;
    kind: string | null;
    status: string | null;
    gateway: string | null;
    amountSet: { shopMoney: { amount: string; currencyCode: string } } | null;
    processedAt: string | null;
  }[];
  fulfillments: {
    id: string;
    status: string | null;
    createdAt: string;
    trackingInfo: { number: string | null; url: string | null; company: string | null }[];
  }[];
  refunds: {
    id: string;
    note: string | null;
    createdAt: string;
    totalRefundedSet: { shopMoney: { amount: string } };
  }[];
};

export const ORDER_FIELDS_FRAGMENT = `
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
  refunds(first: 10) { id note createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
`;

export type UpsertOrderResult = {
  orderId: string;
  isNewlyPaid: boolean;
  isNewlyCancelled: boolean;
  newFulfillmentIds: string[];
  newRefundIds: string[];
};

/**
 * Upserts a single Shopify order (and its items/payments/fulfillments) into Supabase -- the one
 * place that logic lives, shared by the bulk "Sync from Shopify" pull (lib/shopify/sync-orders.ts)
 * and the real-time orders/fulfillments webhooks (app/api/webhooks/shopify/route.ts), so the two
 * paths can never disagree about how a Shopify order maps to Jawhara's schema.
 *
 * Line items are matched to Jawhara's own products/variants by the CURRENT, correct
 * shopify_product_id/shopify_variant_id columns (full GIDs) -- never the legacy shopify_id
 * column, which holds stale ids from this store's original Shopify export and no longer matches
 * anything a real order placed through the current store will reference. Matching by name is
 * never done anywhere in this function.
 *
 * Also resolves and freezes each line item's purchased-variant image/title as an immutable
 * snapshot (order_items.image_url/image_is_variant_specific/variant_title_snapshot) at the
 * moment the order is first seen -- so a later product edit, image reassignment, or deletion can
 * never change what a historical order's emails or admin page show for it.
 */
export async function upsertShopifyOrder(o: ShopifyOrderNode): Promise<UpsertOrderResult> {
  const sid = idTail(o.id)!;

  const { data: existing } = await supabaseService
    .from("orders")
    .select("id, financial_status, cancelled_at")
    .eq("shopify_id", sid)
    .maybeSingle();

  const variantGids = [...new Set(o.lineItems.edges.map((e) => e.node.variant?.id).filter((v): v is string => !!v))];
  const productGids = [...new Set(o.lineItems.edges.map((e) => e.node.product?.id).filter((v): v is string => !!v))];
  const customerGid = o.customer ? idTail(o.customer.id) : null;

  const [{ data: customers }, { data: variants }, { data: products }] = await Promise.all([
    customerGid ? supabaseService.from("customers").select("id, shopify_id").eq("shopify_id", customerGid) : Promise.resolve({ data: [] as any[] }),
    variantGids.length
      ? supabaseService.from("product_variants").select("id, shopify_variant_id").in("shopify_variant_id", variantGids)
      : Promise.resolve({ data: [] as any[] }),
    productGids.length
      ? supabaseService.from("products").select("id, shopify_product_id").in("shopify_product_id", productGids)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const customerIdByShopify = new Map((customers ?? []).map((c) => [c.shopify_id, c.id]));
  const variantIdByGid = new Map((variants ?? []).map((v) => [v.shopify_variant_id, v.id]));
  const productIdByGid = new Map((products ?? []).map((p) => [p.shopify_product_id, p.id]));

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
        ...(o.cancelledAt && !existing?.cancelled_at ? { cancelled_by_shopify: true } : {}),
      },
      { onConflict: "shopify_id" }
    )
    .select("id")
    .single();
  if (orderError || !upsertedOrder) throw new Error(orderError?.message ?? "upsert failed");
  const orderId = upsertedOrder.id;

  const itemRows = o.lineItems.edges.map((edge) => {
    const li = edge.node;
    return {
      shopify_id: idTail(li.id),
      order_id: orderId,
      variant_id: li.variant ? variantIdByGid.get(li.variant.id) ?? null : null,
      product_id: li.product ? productIdByGid.get(li.product.id) ?? null : null,
      title: li.title,
      sku: li.sku || null,
      quantity: li.quantity,
      unit_price: Number(li.originalUnitPriceSet.shopMoney.amount),
      discounted_unit_price: li.discountedUnitPriceSet ? Number(li.discountedUnitPriceSet.shopMoney.amount) : null,
    };
  });
  let newLineItemIds: string[] = [];
  if (itemRows.length) {
    const { data: upsertedItems } = await supabaseService
      .from("order_items")
      .upsert(itemRows, { onConflict: "shopify_id" })
      .select("id, variant_id, product_id, image_url");
    newLineItemIds = (upsertedItems ?? []).filter((i) => i.image_url == null).map((i) => i.id);

    // Freeze the purchased-variant image/title snapshot for any item that doesn't have one yet
    // (a brand new line item, or one synced before this snapshot mechanism existed) -- never
    // overwrites an existing snapshot, since the whole point is that it stays correct even after
    // the live product/media data later changes.
    if (newLineItemIds.length) {
      const needingSnapshot = (upsertedItems ?? []).filter((i) => newLineItemIds.includes(i.id));
      const images = await getOrderItemImages(needingSnapshot.map((i) => ({ id: i.id, variantId: i.variant_id, productId: i.product_id })));
      const { data: variantTitles } = await supabaseService
        .from("product_variants")
        .select("id, title")
        .in("id", needingSnapshot.map((i) => i.variant_id).filter((v): v is string => !!v));
      const variantTitleById = new Map((variantTitles ?? []).map((v) => [v.id, v.title]));
      for (const item of needingSnapshot) {
        const image = images[item.id];
        await supabaseService
          .from("order_items")
          .update({
            image_url: image?.imageUrl ?? null,
            image_is_variant_specific: image?.isVariantSpecific ?? false,
            variant_title_snapshot: item.variant_id ? variantTitleById.get(item.variant_id) ?? null : null,
          })
          .eq("id", item.id);
      }
    }
  }

  const paymentRows = (o.transactions ?? []).map((tx) => ({
    shopify_id: idTail(tx.id),
    order_id: orderId,
    kind: tx.kind || null,
    status: tx.status || null,
    gateway: tx.gateway || null,
    amount: tx.amountSet ? Number(tx.amountSet.shopMoney.amount) : null,
    currency_code: tx.amountSet?.shopMoney.currencyCode ?? null,
    processed_at: tx.processedAt || null,
  }));
  if (paymentRows.length) await supabaseService.from("payments").upsert(paymentRows, { onConflict: "shopify_id" });

  const fulfillmentRows = (o.fulfillments ?? []).map((f) => {
    const tracking = f.trackingInfo?.[0];
    return {
      shopify_id: idTail(f.id),
      order_id: orderId,
      status: f.status || null,
      tracking_number: tracking?.number || null,
      tracking_url: tracking?.url || null,
      tracking_company: tracking?.company || null,
      created_at: f.createdAt,
    };
  });
  let newFulfillmentIds: string[] = [];
  if (fulfillmentRows.length) {
    const { data: existingFulfillments } = await supabaseService
      .from("fulfillments")
      .select("shopify_id")
      .in("shopify_id", fulfillmentRows.map((f) => f.shopify_id!).filter(Boolean));
    const alreadyKnown = new Set((existingFulfillments ?? []).map((f) => f.shopify_id));

    const { data: upserted } = await supabaseService
      .from("fulfillments")
      .upsert(fulfillmentRows, { onConflict: "shopify_id" })
      .select("id, shopify_id, tracking_number, tracking_company");
    newFulfillmentIds = (upserted ?? []).filter((f) => !alreadyKnown.has(f.shopify_id)).map((f) => f.id);

    const withTracking = (upserted ?? []).filter((f) => f.tracking_number);
    if (withTracking.length) {
      const { data: alreadyCached } = await supabaseService
        .from("tracking_cache")
        .select("fulfillment_id")
        .in("fulfillment_id", withTracking.map((f) => f.id));
      const cachedIds = new Set((alreadyCached ?? []).map((c) => c.fulfillment_id));
      const newOnes = withTracking.filter((f) => !cachedIds.has(f.id));
      if (newOnes.length) {
        await registerFulfillmentsForTracking(
          newOnes.map((f) => ({ id: f.id, trackingNumber: f.tracking_number, trackingCompany: f.tracking_company }))
        );
      }
    }
  }

  // Refunds issued directly in Shopify (not through Jawhara admin's own createRefund action,
  // which writes its refund row -- and sends its one email -- synchronously and never touches
  // Shopify at all). Matched by shopify_id exactly like fulfillments above, so a refund already
  // known here (however it got here) is never re-notified.
  // "full"/"partial" (not a new kind) to match the check constraint the admin createRefund
  // action's own rows already use (refunds_kind_check) -- determined per-refund against the
  // order's total, same test createRefund itself applies.
  const orderTotal = Number(o.totalPriceSet.shopMoney.amount);
  const refundRows = (o.refunds ?? []).map((r) => ({
    shopify_id: idTail(r.id),
    order_id: orderId,
    kind: Number(r.totalRefundedSet.shopMoney.amount) >= orderTotal - 0.01 ? ("full" as const) : ("partial" as const),
    amount: Number(r.totalRefundedSet.shopMoney.amount),
    reason: r.note || null,
    created_at: r.createdAt,
  }));
  let newRefundIds: string[] = [];
  if (refundRows.length) {
    const { data: existingRefunds } = await supabaseService
      .from("refunds")
      .select("shopify_id")
      .in("shopify_id", refundRows.map((r) => r.shopify_id!).filter(Boolean));
    const alreadyKnownRefunds = new Set((existingRefunds ?? []).map((r) => r.shopify_id));

    const { data: upsertedRefunds } = await supabaseService.from("refunds").upsert(refundRows, { onConflict: "shopify_id" }).select("id, shopify_id");
    newRefundIds = (upsertedRefunds ?? []).filter((r) => !alreadyKnownRefunds.has(r.shopify_id)).map((r) => r.id);

    if (newRefundIds.length) {
      const totalRefunded = refundRows.reduce((sum, r) => sum + r.amount, 0);
      const isFullRefund = totalRefunded >= orderTotal - 0.01;
      await supabaseService
        .from("orders")
        .update({ financial_status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED" })
        .eq("id", orderId);
    }
  }

  const isNewlyPaid = o.displayFinancialStatus === "PAID" && existing?.financial_status !== "PAID";
  const isNewlyCancelled = !!o.cancelledAt && !existing?.cancelled_at;

  return { orderId, isNewlyPaid, isNewlyCancelled, newFulfillmentIds, newRefundIds };
}

const SINGLE_ORDER_QUERY = `
  query($id: ID!) {
    order(id: $id) { ${ORDER_FIELDS_FRAGMENT} }
  }
`;

/**
 * Re-fetches ONE order fresh from the Admin GraphQL API and upserts it -- what every webhook
 * handler actually does with the order id it extracts from a delivery (app/api/webhooks/shopify/
 * route.ts). Deliberately never trusts a webhook's own payload body as the data source: Shopify's
 * webhook deliveries are REST-shaped JSON (plain numeric ids, no GID strings), a different shape
 * from the GraphQL query this module's mapping logic expects, and re-fetching also guarantees the
 * handler always acts on the order's full CURRENT state rather than whatever partial snapshot
 * that particular delivery happened to carry (relevant since Shopify webhooks can arrive out of
 * order, or be retried well after the state has moved on again).
 */
export async function syncSingleShopifyOrder(shopifyOrderGid: string): Promise<UpsertOrderResult | null> {
  const data = await shopifyGraphQL<{ order: ShopifyOrderNode | null }>(SINGLE_ORDER_QUERY, { id: shopifyOrderGid });
  if (!data.order) return null;
  return upsertShopifyOrder(data.order);
}
