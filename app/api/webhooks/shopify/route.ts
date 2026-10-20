import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { verifyShopifyWebhookSignature } from "@/lib/shopify/webhook-verify";
import { syncSingleShopifyOrder } from "@/lib/shopify/order-sync-shared";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendOrderCancellationEmail } from "@/lib/email/order-cancellation";
import { sendRefundNotificationEmail } from "@/lib/email/refund-notification";
import { buildEmailLineItems } from "@/lib/email/build-line-items";

/**
 * Single endpoint for every Shopify order/fulfillment webhook topic this app subscribes to (see
 * scripts/shopify/register-webhooks.ts) -- real-time two-way sync: a change made directly in
 * Shopify (a staff member fulfilling an order there, a payment capturing, a cancellation) lands
 * here and is reflected in Jawhara within the request, instead of waiting for the next manual
 * "Sync from Shopify" pull.
 *
 * Never trusts the webhook's own JSON body as data -- only as a signal (which order, which
 * topic) to re-fetch that order fresh via the Admin GraphQL API (syncSingleShopifyOrder). See
 * that function's own comment for why.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // signature verification needs the exact raw bytes
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookSignature(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "unknown";
  const webhookId = req.headers.get("x-shopify-webhook-id");
  if (!webhookId) return NextResponse.json({ error: "Missing webhook id" }, { status: 400 });

  // Idempotency: insert the delivery id first. A unique-constraint conflict means Shopify
  // already delivered (or is retrying) this exact attempt -- stop here, don't reprocess.
  const { error: dedupeError } = await supabaseService.from("shopify_webhook_events").insert({ shopify_webhook_id: webhookId, topic });
  if (dedupeError) {
    return NextResponse.json({ received: true, deduped: true });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Every topic this endpoint handles carries the Shopify order's REST (plain-integer) id,
  // either directly (orders/*) or via order_id (fulfillments/*) -- reconstruct the GraphQL
  // global id from it, since that's what the re-fetch (and everything else in this app that
  // talks to the Admin GraphQL API) expects.
  const restOrderId: number | undefined = topic.startsWith("orders/") ? payload.id : payload.order_id;
  if (!restOrderId) {
    // Nothing orderable to resync (shouldn't happen for the topics this endpoint is subscribed
    // to, but never 500 on an unexpected payload shape -- Shopify would just retry it forever).
    return NextResponse.json({ received: true });
  }
  const orderGid = `gid://shopify/Order/${restOrderId}`;

  try {
    const result = await syncSingleShopifyOrder(orderGid);
    if (!result) return NextResponse.json({ received: true, note: "order not found" });

    if (result.isNewlyPaid) {
      await maybeSendOrderConfirmation(result.orderId);
    }
    if (result.isNewlyCancelled) {
      await maybeSendCancellationEmail(result.orderId);
    }
    // A refund issued directly in Shopify (the admin's own createRefund action never reaches
    // here at all -- it writes its refund row and sends its one email synchronously, without
    // ever calling Shopify). result.newRefundIds is already deduped by shopify_id, so a webhook
    // retry for the same refund never re-sends.
    for (const refundId of result.newRefundIds) {
      await maybeSendRefundEmail(refundId);
    }
    // Fulfillments created/updated directly in Shopify (result.newFulfillmentIds) are synced
    // into Supabase above (via syncSingleShopifyOrder -> upsertShopifyOrder) for consistency, but
    // deliberately never auto-email from here: Shopify's own fulfillment screen lets whoever
    // fulfilled there choose to notify the customer themselves, and this app has no way to know
    // whether they already did -- auto-sending here risks a guaranteed duplicate. Fulfillments
    // created THROUGH Jawhara admin (the primary path) already send their one branded email
    // directly from that action, before this webhook for the same fulfillment even arrives.

    return NextResponse.json({ received: true });
  } catch (err) {
    // Remove the dedupe row so a genuine Shopify retry of this exact delivery can reprocess
    // instead of being silently deduped into a permanently stuck half-synced order.
    await supabaseService.from("shopify_webhook_events").delete().eq("shopify_webhook_id", webhookId);
    console.error(`Shopify webhook processing failed for ${webhookId} (${topic}):`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function maybeSendOrderConfirmation(orderId: string) {
  const { data: order } = await supabaseService
    .from("orders")
    .select("order_number, email, subtotal_price, total_discounts, applied_discounts, total_tax, total_shipping, total_price, shipping_address_id")
    .eq("id", orderId)
    .single();
  if (!order?.email) return;

  // Atomic claim: only the first caller to see confirmation_email_sent_at still null gets to
  // send -- a webhook retry (or an admin-triggered re-sync landing on the same order a moment
  // later) that loses this race sends nothing.
  const { data: claimed } = await supabaseService
    .from("orders")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("confirmation_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, title, quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)")
    .eq("order_id", orderId);
  const { data: address } = order.shipping_address_id
    ? await supabaseService.from("addresses").select("first_name, address1, address2, city, zip, country_code").eq("id", order.shipping_address_id).maybeSingle()
    : { data: null };

  const lineItems = await buildEmailLineItems(
    (items ?? []).map((i: any) => ({
      id: i.id,
      title: i.title,
      quantity: i.quantity,
      unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
      variantId: i.variant_id,
      productId: i.product_id,
      variantTitle: i.product_variants?.title ?? null,
      imageUrlSnapshot: i.image_url,
      variantTitleSnapshot: i.variant_title_snapshot,
    }))
  );

  await sendOrderConfirmationEmail({
    to: order.email,
    orderNumber: order.order_number,
    items: lineItems,
    subtotal: Number(order.subtotal_price ?? 0),
    discountTotal: Number(order.total_discounts ?? 0),
    appliedDiscounts: Array.isArray(order.applied_discounts)
      ? (order.applied_discounts as any[]).map((d) => ({ title: d.title, amountOff: Number(d.amountOff) }))
      : undefined,
    vat: Number(order.total_tax ?? 0),
    shipping: Number(order.total_shipping ?? 0),
    total: Number(order.total_price),
    shippingAddress: address
      ? { name: address.first_name, address1: address.address1, address2: address.address2, city: address.city, zip: address.zip, country: address.country_code }
      : null,
  });
}

async function maybeSendCancellationEmail(orderId: string) {
  const { data: order } = await supabaseService.from("orders").select("order_number, email, cancel_reason").eq("id", orderId).single();
  if (!order?.email) return;

  // Same atomic-claim pattern as order confirmation -- also guards against double-sending when
  // an order was already cancelled through Jawhara admin's own cancelOrder() action (which sets
  // this same column directly) moments before this webhook for the same cancellation arrives.
  const { data: claimed } = await supabaseService
    .from("orders")
    .update({ cancellation_email_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("cancellation_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, title, quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)")
    .eq("order_id", orderId);
  const lineItems = await buildEmailLineItems(
    (items ?? []).map((i: any) => ({
      id: i.id,
      title: i.title,
      quantity: i.quantity,
      unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
      variantId: i.variant_id,
      productId: i.product_id,
      variantTitle: i.product_variants?.title ?? null,
      imageUrlSnapshot: i.image_url,
      variantTitleSnapshot: i.variant_title_snapshot,
    }))
  );
  await sendOrderCancellationEmail({ to: order.email, orderNumber: order.order_number, items: lineItems, reason: order.cancel_reason || null });
}

async function maybeSendRefundEmail(refundId: string) {
  const { data: refund } = await supabaseService.from("refunds").select("id, order_id, amount, reason").eq("id", refundId).single();
  if (!refund) return;
  const { data: order } = await supabaseService.from("orders").select("order_number, email").eq("id", refund.order_id).maybeSingle();
  if (!order?.email) return;

  // Same atomic-claim pattern as the order-level emails above, on refunds.notification_sent_at.
  const { data: claimed } = await supabaseService
    .from("refunds")
    .update({ notification_sent_at: new Date().toISOString() })
    .eq("id", refundId)
    .is("notification_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  // Shopify's refund webhook doesn't carry a precise line-item breakdown in the fields this app
  // queries (order-sync-shared.ts's ORDER_FIELDS_FRAGMENT) -- show every item on the order, same
  // as the (now-dead) Stripe charge.refunded handler always did for an order-level refund.
  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, title, quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)")
    .eq("order_id", refund.order_id);
  const lineItems = await buildEmailLineItems(
    (items ?? []).map((i: any) => ({
      id: i.id,
      title: i.title,
      quantity: i.quantity,
      unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
      variantId: i.variant_id,
      productId: i.product_id,
      variantTitle: i.product_variants?.title ?? null,
      imageUrlSnapshot: i.image_url,
      variantTitleSnapshot: i.variant_title_snapshot,
    }))
  );
  await sendRefundNotificationEmail({ to: order.email, orderNumber: order.order_number, refundAmount: Number(refund.amount), reason: refund.reason, items: lineItems });
}
