// Read-only order reconciliation: live re-pull of every Shopify order (same field set as
// extract/orders.ts, plus refunds -- never captured by the original extraction), diffed against
// the full current Supabase orders/order_items/payments/fulfillments/refunds/addresses state.
// Writes NOTHING -- this is the report step. See import-missing-orders.ts for the write step,
// and the plan file's "Orders/customers/catalog reconciliation" section for full context.
import { paginateAll } from "./client.ts";
import { runSql } from "../supabase/db.ts";
import { writeFileSync, mkdirSync } from "node:fs";

function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

const QUERY = `
  query($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          name
          email
          phone
          createdAt
          updatedAt
          processedAt
          cancelledAt
          cancelReason
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          test
          customer { id }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          shippingAddress { firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone }
          billingAddress { firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone }
          lineItems(first: 100) {
            edges { node { id title quantity sku variant { id } product { id } originalUnitPriceSet { shopMoney { amount currencyCode } } discountedUnitPriceSet { shopMoney { amount currencyCode } } } }
          }
          fulfillments(first: 10) {
            id
            status
            createdAt
            trackingInfo { number url company }
          }
          transactions(first: 10) {
            id
            kind
            status
            gateway
            amountSet { shopMoney { amount currencyCode } }
            processedAt
          }
          refunds(first: 10) {
            id
            createdAt
            note
            totalRefundedSet { shopMoney { amount currencyCode } }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

console.log("Pulling live Shopify orders (full re-pull, no filter)...");
const liveOrders: any[] = [];
await paginateAll(
  QUERY,
  (data: any) => data.orders,
  async (nodes, pageNum) => {
    liveOrders.push(...nodes);
    console.log(`  page ${pageNum}: +${nodes.length} orders (total ${liveOrders.length})`);
  },
  25
);
console.log(`✓ Live Shopify orders: ${liveOrders.length}\n`);

// runSql (Management API, not PostgREST) avoids PostgREST's default row cap -- addresses alone is
// already past 1000 rows, and this must stay correct as the catalog grows further.
console.log("Pulling current Supabase state...");
const [supaOrders, supaItems, supaPayments, supaFulfillments, supaRefunds, supaAddresses] = await Promise.all([
  runSql<any[]>(`select id, shopify_id, order_number, email, currency_code, financial_status, fulfillment_status, subtotal_price, total_shipping, total_tax, total_discounts, total_price, cancelled_at, cancel_reason, created_at, stripe_checkout_session_id from orders`),
  runSql<any[]>(`select id, shopify_id, order_id, title, sku, quantity, unit_price, discounted_unit_price from order_items`),
  runSql<any[]>(`select id, shopify_id, order_id from payments`),
  runSql<any[]>(`select id, shopify_id, order_id from fulfillments`),
  runSql<any[]>(`select id, shopify_id, order_id from refunds`),
  runSql<any[]>(`select id, shopify_id, order_id, customer_id from addresses`),
]);
console.log(`✓ Supabase: ${supaOrders.length} orders, ${supaItems.length} order_items, ${supaPayments.length} payments, ${supaFulfillments.length} fulfillments, ${supaRefunds.length} refunds, ${supaAddresses.length} addresses\n`);

const supaByShopifyId = new Map(supaOrders.filter((o) => o.shopify_id).map((o) => [o.shopify_id, o]));
const liveByShopifyId = new Map(liveOrders.map((o) => [idTail(o.id)!, o]));

const shopifyOriginOrders = supaOrders.filter((o) => o.shopify_id);
const stripeOriginOrders = supaOrders.filter((o) => o.stripe_checkout_session_id);

const missingFromSupabase = liveOrders.filter((o) => !supaByShopifyId.has(idTail(o.id)!));
const missingFromShopify = shopifyOriginOrders.filter((o) => !liveByShopifyId.has(o.shopify_id));

type Mismatch = { shopifyId: string; orderNumber: string; field: string; expected: string; actual: string };
const drifted: Mismatch[] = [];

function cmp(shopifyId: string, orderNumber: string, field: string, live: unknown, supa: unknown, kind: "string" | "number" | "date" = "string") {
  if (live == null && supa == null) return;
  let equal: boolean;
  if (kind === "number") {
    equal = Number(live) === Number(supa);
  } else if (kind === "date") {
    equal = live == null || supa == null ? live == supa : new Date(live as string).getTime() === new Date(supa as string).getTime();
  } else {
    equal = String(live ?? "") === String(supa ?? "");
  }
  if (!equal) drifted.push({ shopifyId, orderNumber, field, expected: live == null ? "null" : String(live), actual: supa == null ? "null" : String(supa) });
}

for (const live of liveOrders) {
  const sid = idTail(live.id)!;
  const supa = supaByShopifyId.get(sid);
  if (!supa) continue; // already counted as missing
  cmp(sid, live.name, "financial_status", live.displayFinancialStatus, supa.financial_status);
  cmp(sid, live.name, "fulfillment_status", live.displayFulfillmentStatus, supa.fulfillment_status);
  cmp(sid, live.name, "total_price", live.totalPriceSet.shopMoney.amount, supa.total_price, "number");
  cmp(sid, live.name, "cancelled_at", live.cancelledAt, supa.cancelled_at, "date");
  cmp(sid, live.name, "currency_code", live.currencyCode, supa.currency_code);
}

const supaItemsByOrderId = new Map<string, any[]>();
for (const item of supaItems) {
  if (!supaItemsByOrderId.has(item.order_id)) supaItemsByOrderId.set(item.order_id, []);
  supaItemsByOrderId.get(item.order_id)!.push(item);
}
const supaIdByShopifyId = new Map(supaOrders.filter((o) => o.shopify_id).map((o) => [o.shopify_id, o.id]));

let missingLineItemsCount = 0;
for (const live of liveOrders) {
  const sid = idTail(live.id)!;
  const supaOrderId = supaIdByShopifyId.get(sid);
  if (!supaOrderId) continue;
  const liveItemIds = new Set(live.lineItems.edges.map((e: any) => idTail(e.node.id)));
  const supaItemIds = new Set((supaItemsByOrderId.get(supaOrderId) ?? []).map((i) => i.shopify_id));
  for (const id of liveItemIds) if (!supaItemIds.has(id)) missingLineItemsCount++;
}

// Which Shopify-origin orders have zero payments/fulfillments/addresses rows at all (the known
// pipeline gap -- 06-orders.ts never wrote these tables).
const orderIdsWithPayments = new Set(supaPayments.map((p) => p.order_id));
const orderIdsWithFulfillments = new Set(supaFulfillments.map((f) => f.order_id));
const orderIdsWithAddresses = new Set(supaAddresses.map((a) => a.order_id).filter(Boolean));
const ordersMissingPayments = shopifyOriginOrders.filter((o) => !orderIdsWithPayments.has(o.id));
const ordersMissingFulfillments = shopifyOriginOrders.filter(
  (o) => liveByShopifyId.get(o.shopify_id)?.fulfillments?.length > 0 && !orderIdsWithFulfillments.has(o.id)
);
const ordersMissingAddresses = shopifyOriginOrders.filter((o) => !orderIdsWithAddresses.has(o.id));

const liveRefundsCount = liveOrders.reduce((sum, o) => sum + (o.refunds?.length ?? 0), 0);

mkdirSync("data/exports", { recursive: true });
writeFileSync(
  "data/exports/order-reconciliation-mismatches.json",
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      liveOrderCount: liveOrders.length,
      supabaseOrderCount: supaOrders.length,
      shopifyOriginCount: shopifyOriginOrders.length,
      stripeOriginCount: stripeOriginOrders.length,
      missingFromSupabase: missingFromSupabase.map((o) => ({ shopifyId: idTail(o.id), name: o.name, createdAt: o.createdAt, total: o.totalPriceSet.shopMoney.amount })),
      missingFromShopify: missingFromShopify.map((o) => ({ shopifyId: o.shopify_id, orderNumber: o.order_number, createdAt: o.created_at, total: o.total_price })),
      fieldDrift: drifted,
      missingLineItemsCount,
      ordersMissingPayments: ordersMissingPayments.map((o) => o.shopify_id),
      ordersMissingFulfillments: ordersMissingFulfillments.map((o) => o.shopify_id),
      ordersMissingAddresses: ordersMissingAddresses.map((o) => o.shopify_id),
      liveRefundsCount,
      supabaseRefundsCount: supaRefunds.length,
    },
    null,
    2
  )
);

console.log("=== RECONCILIATION SUMMARY ===");
console.log(`Live Shopify orders:              ${liveOrders.length}`);
console.log(`Supabase orders (total):          ${supaOrders.length}`);
console.log(`  - Shopify-origin:               ${shopifyOriginOrders.length}`);
console.log(`  - Stripe-origin:                ${stripeOriginOrders.length}`);
console.log(`Missing from Supabase (to import): ${missingFromSupabase.length}`);
missingFromSupabase.forEach((o) => console.log(`    ${o.name} (${idTail(o.id)}, created ${o.createdAt})`));
console.log(`Missing from live Shopify (report only, NOT deleted): ${missingFromShopify.length}`);
missingFromShopify.forEach((o) => console.log(`    ${o.order_number} (${o.shopify_id}, created ${o.created_at})`));
console.log(`Field drift found:                 ${drifted.length} mismatches across ${new Set(drifted.map((d) => d.shopifyId)).size} orders`);
console.log(`Missing line items:                ${missingLineItemsCount}`);
console.log(`Orders missing payments rows:       ${ordersMissingPayments.length} / ${shopifyOriginOrders.length}`);
console.log(`Orders missing fulfillments rows:   ${ordersMissingFulfillments.length}`);
console.log(`Orders missing addresses rows:      ${ordersMissingAddresses.length} / ${shopifyOriginOrders.length}`);
console.log(`Live refunds found:                 ${liveRefundsCount} (Supabase currently has: ${supaRefunds.length})`);
console.log("\nFull detail written to data/exports/order-reconciliation-mismatches.json");
