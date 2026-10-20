import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { verifyShopifyWebhookSignature } from "@/lib/shopify/webhook-verify";
import { syncSingleShopifyOrder } from "@/lib/shopify/order-sync-shared";
import { reportNewlyPaidPurchase, maybeSendCancellationEmail } from "@/lib/shopify/sync-side-effects";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

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

    // Order confirmation and refund notifications are intentionally NOT sent from here: Shopify's
    // own native "Order confirmation" and "Refund" customer notifications are the system of
    // record for those two events (business decision), so Jawhara must never also send them --
    // see lib/shopify/sync-side-effects.ts's own comment. Jawhara's own refunds.ts admin action is
    // separately blocked from ever refunding a Shopify order, so the only place a Shopify order's
    // refund can happen at all is Shopify itself, and result.newRefundIds (from upsertShopifyOrder
    // above) only exists so refund rows/financial_status stay in sync here, nothing more.
    if (result.isNewlyPaid) {
      // The ONLY Purchase signal Meta gets for this storefront, since checkout happens entirely on
      // Shopify's own domain with no native Facebook/Instagram channel installed and no browser
      // pixel ever fires for it. See lib/marketing/capi-purchase.ts's own comment for the full
      // reasoning.
      await reportNewlyPaidPurchase(result.orderId);
    }
    if (result.isNewlyCancelled) {
      await maybeSendCancellationEmail(result.orderId);
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
    await logIntegrationError("webhook", (err as Error).message, { webhookId, topic, restOrderId });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

