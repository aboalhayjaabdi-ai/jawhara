import { createHash } from "crypto";
import { supabaseService } from "@/lib/supabase/service-client";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";

if (typeof window !== "undefined") {
  throw new Error("lib/marketing/capi-purchase.ts must never be imported into client code");
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type CapiPurchaseResult = { ok: true; skipped?: string } | { ok: false; error: string };

/**
 * Reports a confirmed Shopify order's Purchase to Meta via the Conversions API -- the ONLY
 * Purchase signal Meta receives for this storefront. There is no browser-side counterpart to
 * deduplicate against: checkout happens entirely on Shopify's own hosted domain
 * (jawharastore.se), this store has no Shopify "Facebook & Instagram" sales channel installed
 * (confirmed -- nothing else could be reporting this same purchase to Meta), and the old
 * Stripe-era confirmation page (app/(storefront)/kassa/bekraftelse) that used to fire a browser
 * pixel Purchase alongside this same call is unreachable from the real storefront checkout flow
 * now (only the admin's manual-order Stripe link still uses it). If a browser-side Purchase is
 * ever added back (e.g. via a Shopify checkout web pixel extension), give it the SAME event_id
 * this sends (shopify_order_<order id>) so Meta can dedupe the two.
 *
 * Called from app/api/webhooks/shopify/route.ts only when an order newly becomes PAID there --
 * deliberately not from the periodic bulk "Sync from Shopify" pull (lib/shopify/sync-orders.ts),
 * same reasoning as that pull never sending the confirmation email either: reporting a
 * backfilled, possibly much-older order's purchase to Meta out of real time would feed its ad
 * optimization bad signal, not a safety net worth having.
 *
 * Claimed atomically on orders.purchase_event_sent_at before sending, so a webhook retry (or this
 * racing the confirmation-email claim, which is a separate column) can never report the same
 * order twice. Every value sent is re-derived from the real orders/order_items rows by orderId --
 * never trusted from any caller-supplied data.
 */
export async function reportPurchaseToMeta(orderId: string): Promise<CapiPurchaseResult> {
  const { data: order } = await supabaseService
    .from("orders")
    .select("id, shopify_id, order_number, financial_status, total_price, currency_code, email, phone")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.financial_status?.toUpperCase() !== "PAID") {
    return { ok: false, error: `Order is not paid (financial_status=${order.financial_status})` };
  }

  const settings = await getMarketingSettings();
  if (!settings.metaPixelId || !settings.metaCapiAccessToken) {
    return { ok: true, skipped: "Meta CAPI not configured" };
  }

  // Atomic claim -- whichever caller (this one, or a future one) gets here first for this order
  // is the only one that ever reports it.
  const { data: claimed } = await supabaseService
    .from("orders")
    .update({ purchase_event_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("purchase_event_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: true, skipped: "Already reported" };

  const { data: items } = await supabaseService
    .from("order_items")
    .select("variant_id, quantity, unit_price, discounted_unit_price")
    .eq("order_id", orderId);

  const contents = (items ?? [])
    .filter((i) => i.variant_id)
    .map((i) => ({
      id: i.variant_id as string,
      quantity: i.quantity,
      item_price: Number(i.discounted_unit_price ?? i.unit_price),
    }));

  const userData: Record<string, string[]> = {};
  if (order.email) userData.em = [sha256(order.email)];
  if (order.phone) userData.ph = [sha256(order.phone.replace(/[^\d+]/g, ""))];

  const eventId = `shopify_order_${order.shopify_id ?? order.id}`;
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: order.currency_code,
          value: Number(order.total_price),
          content_name: order.order_number,
          content_type: "product",
          contents,
          num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(settings.metaCapiAccessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Release the claim so a genuine retry (webhook redelivery) can try again instead of being
      // permanently marked "sent" when Meta actually rejected it.
      await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
      return { ok: false, error: data?.error?.message ?? `Meta CAPI request failed (${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
    return { ok: false, error: `Network error calling Meta CAPI: ${(err as Error).message}` };
  }
}
