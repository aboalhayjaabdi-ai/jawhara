// One-time historical backfill for the 283-vs-400 order discrepancy (see
// docs/order-reconciliation-report.md). The dedicated migration app's token only has `read_orders`
// (not `read_all_orders`), which silently restricts it to a rolling ~60-day window -- it can never
// see the real full order history on its own. This script makes ZERO Shopify API calls itself: it
// reads the full ~400-order history already pulled, read-only, via a separately-connected broader-
// scoped Shopify app (see data/exports/orders-mcp-backfill.jsonl), and upserts it into Supabase
// using the exact same idempotent shopify_id-keyed pipeline as import-missing-orders.ts.
//
// Zero Stripe API calls, zero Resend/email calls, zero Shopify mutations -- reads a local file,
// writes to Supabase only. Safe to re-run at any time.
import { upsert, shopifyIdMap } from "../supabase/rest.ts";
import { readJsonl, idTail } from "../supabase/import/util.ts";

const orders: any[] = readJsonl("orders-mcp-backfill");
console.log(`Loaded ${orders.length} orders from data/exports/orders-mcp-backfill.jsonl\n`);

const customerIdByShopify = await shopifyIdMap("customers");
const productIdByShopify = await shopifyIdMap("products");
const variantIdByShopify = await shopifyIdMap("product_variants");

function addressRow(addr: any, orderShopifyId: string, kind: "ship" | "bill") {
  if (!addr) return null;
  return {
    // Order-level shipping/billing addresses have no real Shopify GID (MailingAddress is an
    // embedded object on Order, not a node) -- this is a synthetic, deterministic key, clearly
    // not a real Shopify ID, used only so re-running this script stays idempotent via the same
    // shopify_id-unique upsert pattern every other import in this project uses.
    shopify_id: `order-${kind}:${orderShopifyId}`,
    first_name: addr.firstName || null,
    last_name: addr.lastName || null,
    company: null,
    address1: addr.address1 || null,
    address2: addr.address2 || null,
    city: addr.city || null,
    province: addr.province || null,
    province_code: addr.provinceCode || null,
    zip: addr.zip || null,
    country: addr.country || null,
    country_code: addr.countryCodeV2 || null,
    phone: addr.phone || null,
    is_default: false,
  };
}

// --- Pass 1: addresses (need their generated UUIDs before the orders upsert, to set shipping_address_id) ---
const addressRows: any[] = [];
for (const o of orders) {
  const sid = idTail(o.id)!;
  const ship = addressRow(o.shippingAddress, sid, "ship");
  const bill = addressRow(o.billingAddress, sid, "bill");
  if (ship) addressRows.push(ship);
  if (bill) addressRows.push(bill);
}
const upsertedAddresses: any[] = [];
for (let i = 0; i < addressRows.length; i += 200) {
  upsertedAddresses.push(...(await upsert("addresses", addressRows.slice(i, i + 200), "shopify_id")));
}
const addressIdByShopify = new Map(upsertedAddresses.map((a) => [a.shopify_id, a.id]));
console.log(`✓ addresses: ${addressRows.length} upserted`);

// --- Pass 2: orders (full row -- imports anything missing AND overwrites drifted fields on
// existing rows, since upsert's merge-duplicates sets every column sent). source: "shopify" marks
// these as Shopify-origin for the admin UI's provider badge/filter (see migration 0012). ---
const orderRows = orders.map((o: any) => {
  const sid = idTail(o.id)!;
  return {
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
    shipping_address_id: addressIdByShopify.get(`order-ship:${sid}`) ?? null,
  };
});
for (let i = 0; i < orderRows.length; i += 50) {
  await upsert("orders", orderRows.slice(i, i + 50), "shopify_id");
}
console.log(`✓ orders: ${orderRows.length} upserted`);

const orderIdByShopify = await shopifyIdMap("orders");

// Link the order-level address rows to their order (addresses.order_id), now that order ids exist.
const addressLinkRows = addressRows
  .map((a) => {
    const orderSid = a.shopify_id.split(":")[1];
    const orderId = orderIdByShopify.get(orderSid);
    return orderId ? { shopify_id: a.shopify_id, order_id: orderId, ...a } : null;
  })
  .filter(Boolean);
for (let i = 0; i < addressLinkRows.length; i += 200) {
  await upsert("addresses", addressLinkRows.slice(i, i + 200) as any[], "shopify_id");
}
console.log(`✓ addresses: ${addressLinkRows.length} linked to their order`);

// --- Pass 3: order_items ---
const itemRows: any[] = [];
for (const o of orders) {
  const orderId = orderIdByShopify.get(idTail(o.id)!);
  for (const edge of o.lineItems.edges) {
    const li = edge.node;
    itemRows.push({
      shopify_id: idTail(li.id),
      order_id: orderId,
      variant_id: li.variant ? variantIdByShopify.get(idTail(li.variant.id)!) ?? null : null,
      product_id: li.product ? productIdByShopify.get(idTail(li.product.id)!) ?? null : null,
      title: li.title,
      sku: li.sku || null,
      quantity: li.quantity,
      unit_price: Number(li.originalUnitPriceSet.shopMoney.amount),
      discounted_unit_price: li.discountedUnitPriceSet ? Number(li.discountedUnitPriceSet.shopMoney.amount) : null,
    });
  }
}
for (let i = 0; i < itemRows.length; i += 200) {
  await upsert("order_items", itemRows.slice(i, i + 200), "shopify_id");
}
console.log(`✓ order_items: ${itemRows.length} upserted`);

// --- Pass 4: payments (from transactions) ---
const paymentRows: any[] = [];
for (const o of orders) {
  const orderId = orderIdByShopify.get(idTail(o.id)!);
  for (const tx of o.transactions ?? []) {
    paymentRows.push({
      shopify_id: idTail(tx.id),
      order_id: orderId,
      kind: tx.kind || null,
      status: tx.status || null,
      gateway: tx.gateway || null,
      amount: tx.amountSet ? Number(tx.amountSet.shopMoney.amount) : null,
      currency_code: tx.amountSet?.shopMoney.currencyCode ?? null,
      processed_at: tx.processedAt || null,
    });
  }
}
for (let i = 0; i < paymentRows.length; i += 200) {
  await upsert("payments", paymentRows.slice(i, i + 200), "shopify_id");
}
console.log(`✓ payments: ${paymentRows.length} upserted`);

// --- Pass 5: fulfillments ---
const fulfillmentRows: any[] = [];
for (const o of orders) {
  const orderId = orderIdByShopify.get(idTail(o.id)!);
  for (const f of o.fulfillments ?? []) {
    const tracking = f.trackingInfo?.[0];
    fulfillmentRows.push({
      shopify_id: idTail(f.id),
      order_id: orderId,
      status: f.status || null,
      tracking_number: tracking?.number || null,
      tracking_url: tracking?.url || null,
      tracking_company: tracking?.company || null,
      created_at: f.createdAt,
    });
  }
}
for (let i = 0; i < fulfillmentRows.length; i += 200) {
  await upsert("fulfillments", fulfillmentRows.slice(i, i + 200), "shopify_id");
}
console.log(`✓ fulfillments: ${fulfillmentRows.length} upserted`);

// --- Pass 6: refunds ---
const refundRows: any[] = [];
for (const o of orders) {
  const orderId = orderIdByShopify.get(idTail(o.id)!);
  for (const r of o.refunds ?? []) {
    refundRows.push({
      shopify_id: idTail(r.id),
      order_id: orderId,
      amount: r.totalRefundedSet ? Number(r.totalRefundedSet.shopMoney.amount) : 0,
      reason: r.note || null,
      created_at: r.createdAt,
    });
  }
}
for (let i = 0; i < refundRows.length; i += 200) {
  await upsert("refunds", refundRows.slice(i, i + 200), "shopify_id");
}
console.log(`✓ refunds: ${refundRows.length} upserted`);

console.log("\n✓ Historical backfill complete.");
