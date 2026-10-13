// Write step for order reconciliation. Per reconcile-orders.ts's report: 0 orders are currently
// missing from Supabase, but this script handles that case anyway (idempotent, re-runnable) so it
// doubles as the "final incremental sync" mentioned in the plan. It also closes the real pipeline
// gap where 06-orders.ts never wrote payments/fulfillments/refunds/addresses, and applies the field
// drift already found (3 orders whose fulfillment_status changed since the original extraction).
//
// Zero Stripe API calls, zero Resend/email calls, zero Shopify mutations -- reads from Shopify,
// writes to Supabase only, via the same idempotent shopify_id-keyed upsert() used everywhere else
// in this project. Safe to re-run at any time (e.g. as a pre-launch final sync).
import { paginateAll } from "./client.ts";
import { upsert, shopifyIdMap } from "../supabase/rest.ts";

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
          processedAt
          cancelledAt
          cancelReason
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          note
          tags
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

console.log("Pulling live Shopify orders...");
const orders: any[] = [];
await paginateAll(QUERY, (d: any) => d.orders, async (nodes) => orders.push(...nodes), 25);
console.log(`✓ ${orders.length} live orders\n`);

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

// --- Pass 2: orders (full row -- this both imports anything missing AND overwrites drifted fields
// like fulfillment_status on existing rows, since upsert's merge-duplicates sets every column sent) ---
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

console.log("\n✓ Import/backfill complete. Re-run reconcile-orders.ts to confirm zero remaining gaps.");
