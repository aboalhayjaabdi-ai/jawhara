import { upsert, selectAll } from "../rest.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

const orders = readJsonl("orders");

const customerIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("customers", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);
const productIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);
const variantIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("product_variants", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

const orderRows = orders.map((o: any) => ({
  shopify_id: idTail(o.id),
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
}));

for (const batch of chunk(orderRows, 50)) {
  await upsert("orders", batch, "shopify_id");
}
console.log(`✓ orders: ${orderRows.length} upserted`);

const orderIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("orders", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

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
for (const batch of chunk(itemRows, 200)) {
  await upsert("order_items", batch, "shopify_id");
}
console.log(`✓ order_items: ${itemRows.length} upserted`);
