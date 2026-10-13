// One-off verification script: sends all 4 real transactional email types to support@jawhara.se
// using real existing order data (order #SE10073), read-only -- no row in orders/order_items/
// refunds/fulfillments is ever created, updated, or deleted, and no email goes to a real
// customer. Every call below goes through the exact same send functions/templates the real admin
// actions and webhook use (lib/email/*.ts), so this proves the real code path, not a simulation.
// Sandbox-only: this environment's outbound fetch needs the proxy dispatcher wired explicitly
// (api.resend.com isn't reached by the global fetch otherwise) -- same pattern used elsewhere in
// this project for sandbox testing; production (Vercel) needs no such setup.
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

import { supabaseService } from "@/lib/supabase/service-client";
import { buildEmailLineItems } from "@/lib/email/build-line-items";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendShippingConfirmationEmail } from "@/lib/email/shipping-confirmation";
import { sendRefundNotificationEmail } from "@/lib/email/refund-notification";
import { sendOrderCancellationEmail } from "@/lib/email/order-cancellation";

const TEST_TO = "support@jawhara.se";
const ORDER_ID = "76a2b989-78c5-45fe-9ea2-7b53c6f62c79"; // real order #SE10073

async function main() {
  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, subtotal_price, total_discounts, total_tax, total_shipping, total_price, shipping_address_id")
    .eq("id", ORDER_ID)
    .single();
  if (!order) throw new Error("Test order not found.");

  const { data: rawItems } = await supabaseService
    .from("order_items")
    .select("id, title, quantity, unit_price, discounted_unit_price, variant_id, product_id, product_variants(title)")
    .eq("order_id", ORDER_ID);

  const { data: address } = order.shipping_address_id
    ? await supabaseService.from("addresses").select("first_name, last_name, address1, address2, city, zip, country").eq("id", order.shipping_address_id).single()
    : { data: null };

  const lineItems = await buildEmailLineItems(
    (rawItems ?? []).map((i: any) => ({
      id: i.id,
      title: i.title,
      quantity: i.quantity,
      unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
      variantId: i.variant_id,
      productId: i.product_id,
      variantTitle: i.product_variants?.title ?? null,
    }))
  );
  console.log(`Resolved ${lineItems.length} line items, images: ${lineItems.map((i) => (i.imageUrl ? "yes" : "NO IMAGE")).join(", ")}`);

  const shippingAddress = address
    ? { name: [address.first_name, address.last_name].filter(Boolean).join(" "), address1: address.address1, address2: address.address2, city: address.city, zip: address.zip, country: address.country }
    : null;

  console.log("Sending order confirmation...");
  await sendOrderConfirmationEmail({
    to: TEST_TO,
    orderNumber: `${order.order_number} [TEST]`,
    items: lineItems,
    subtotal: Number(order.subtotal_price ?? 0),
    discountTotal: Number(order.total_discounts ?? 0),
    vat: Number(order.total_tax ?? 0),
    shipping: Number(order.total_shipping ?? 0),
    total: Number(order.total_price),
    shippingAddress,
  });

  console.log("Sending shipping confirmation...");
  await sendShippingConfirmationEmail({
    to: TEST_TO,
    orderId: order.id,
    orderNumber: `${order.order_number} [TEST]`,
    items: lineItems,
    shippingAddress,
    trackingNumber: "4PX3002964426589CN",
    carrier: "4PX",
  });

  console.log("Sending refund notification...");
  await sendRefundNotificationEmail({
    to: TEST_TO,
    orderNumber: `${order.order_number} [TEST]`,
    refundAmount: Number(lineItems[0].unitPrice),
    reason: "TEST-mejl -- ingen verklig återbetalning har genomförts. Riktig orderdata används endast för granskning av mallen.",
    items: [lineItems[0]],
  });

  console.log("Sending cancellation notification...");
  await sendOrderCancellationEmail({
    to: TEST_TO,
    orderNumber: `${order.order_number} [TEST]`,
    items: lineItems,
    reason: "TEST-mejl -- ingen verklig avbokning har genomförts. Riktig orderdata används endast för granskning av mallen.",
  });

  console.log("All 4 test emails sent to", TEST_TO);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
