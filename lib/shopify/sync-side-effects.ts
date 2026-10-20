import { supabaseService } from "@/lib/supabase/service-client";
import { sendOrderCancellationEmail } from "@/lib/email/order-cancellation";
import { buildEmailLineItems } from "@/lib/email/build-line-items";
import { reportPurchaseToMeta, type PurchaseReportSource } from "@/lib/marketing/capi-purchase";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/sync-side-effects.ts must never be imported into client code");
}

/**
 * Shared between the real-time webhook (app/api/webhooks/shopify/route.ts) and the daily
 * reconciliation cron (app/api/cron/sync-orders/route.ts), so a state transition a webhook missed
 * still gets exactly one Meta Purchase report / cancellation email, never a duplicate: both
 * callers go through the same atomic-claim columns (orders.purchase_event_sent_at,
 * orders.cancellation_email_sent_at), so whichever caller observes the transition first is the
 * only one that ever acts on it.
 *
 * Order confirmation and refund notification emails are NOT sent from here by design: Shopify's
 * own native "Order confirmation" and "Refund" customer notifications are the system of record
 * for those two events (business decision -- see the cancellation/shipping emails below, which
 * stay on Resend since Shopify's own notifications for those are suppressed at the point Jawhara
 * creates them).
 */
export async function reportNewlyPaidPurchase(orderId: string, source: PurchaseReportSource = "webhook"): Promise<void> {
  const capiResult = await reportPurchaseToMeta(orderId, source);
  if (!capiResult.ok) {
    console.error(`Meta CAPI Purchase failed for order ${orderId}: ${capiResult.error}`);
    await logIntegrationError("capi", capiResult.error, {}, orderId);
  }
}

export async function maybeSendCancellationEmail(orderId: string): Promise<void> {
  const { data: order } = await supabaseService.from("orders").select("order_number, email, cancel_reason").eq("id", orderId).single();
  if (!order?.email) return;

  // Atomic claim -- also guards against double-sending when an order was already cancelled
  // through Jawhara admin's own cancelOrder() action (which sets this same column directly)
  // moments before this same cancellation is observed here.
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
