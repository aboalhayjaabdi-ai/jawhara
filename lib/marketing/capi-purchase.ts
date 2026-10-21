import { createHash } from "crypto";
import { supabaseService } from "@/lib/supabase/service-client";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";

if (typeof window !== "undefined") {
  throw new Error("lib/marketing/capi-purchase.ts must never be imported into client code");
}

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CapiPurchaseResult = { ok: true; skipped?: string } | { ok: false; error: string };
export type PurchaseReportSource = "webhook" | "cron_sync" | "github_actions" | "pg_cron";
export type RecoverySource = Exclude<PurchaseReportSource, "webhook">;

type MetaCallOutcome = { ok: true } | { ok: false; error: string; retryable: boolean };

async function postToMetaWithRetry(url: string, payload: unknown, maxAttempts = 3): Promise<MetaCallOutcome> {
  let lastError: MetaCallOutcome = { ok: false, error: "Not attempted", retryable: true };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (res.ok) return { ok: true };
      // 4xx (bad token, malformed event, etc.) won't succeed on retry within this same process --
      // only retry on 5xx (Meta's own transient failure), same as the network-error branch below.
      const retryable = res.status >= 500;
      lastError = { ok: false, error: data?.error?.message ?? `Meta CAPI request failed (${res.status})`, retryable };
      if (!retryable) return lastError;
    } catch (err) {
      lastError = { ok: false, error: `Network error calling Meta CAPI: ${(err as Error).message}`, retryable: true };
    }
    if (attempt < maxAttempts) await sleep(attempt * 500);
  }
  return lastError;
}

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
 * Called from three places, all converging on the same atomic claim (orders.purchase_event_sent_at)
 * so an order is reported exactly once regardless of which caller gets there first:
 *  - the real-time webhook (source: "webhook"), the fast path, targeting a few seconds of latency
 *    under normal Shopify delivery conditions (not a guaranteed bound -- Shopify's own delivery
 *    isn't guaranteed either);
 *  - the ~5-minute GitHub Actions recovery sweep (source: "github_actions");
 *  - the daily Vercel Cron reconciliation sweep (source: "cron_sync"), the final backstop.
 * Every one of these logs a purchase_tracking_log row (payment confirmed -> this caller observed
 * it -> Meta submitted -> Meta accepted/rejected) so actual end-to-end latency, and which path
 * actually caught each order, is measurable after the fact.
 *
 * Every value sent is re-derived from the real orders/order_items rows by orderId -- never
 * trusted from any caller-supplied data.
 */
export async function reportPurchaseToMeta(orderId: string, source: PurchaseReportSource = "webhook"): Promise<CapiPurchaseResult> {
  const { data: order } = await supabaseService
    .from("orders")
    .select("id, shopify_id, order_number, financial_status, total_price, currency_code, email, phone, is_test_order, processed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.financial_status?.toUpperCase() !== "PAID") {
    return { ok: false, error: `Order is not paid (financial_status=${order.financial_status})` };
  }
  // Shopify's own "test order" flag (orders placed via the admin's "Place test order" action, or
  // created with test: true through the API) is never a real purchase -- reporting it to Meta
  // would feed live ad optimization and reporting a fake conversion. This is the only guard
  // against that, so it applies unconditionally, not just during deliberate pipeline testing.
  if (order.is_test_order) {
    return { ok: true, skipped: "Shopify test order - not reported to Meta" };
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

  // Everything from here on is wraped so ANY unexpected failure -- not just a Meta API error, but
  // e.g. a transient Supabase read -- still releases the claim below. Without this, an order could
  // get permanently stuck "sent" with purchase_event_sent_at set but no Meta event ever actually
  // delivered: the real-time webhook won't retry it (isNewlyPaid is only true once), so only this
  // release lets the 5-minute/daily reconciliation sweeps pick it back up.
  let logRowId: string | null = null;
  try {
    const { data: logRow } = await supabaseService
      .from("purchase_tracking_log")
      .insert({ order_id: orderId, source, payment_confirmed_at: order.processed_at, detected_at: new Date().toISOString() })
      .select("id")
      .single();
    logRowId = logRow?.id ?? null;

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

    if (logRowId) await supabaseService.from("purchase_tracking_log").update({ capi_submitted_at: new Date().toISOString() }).eq("id", logRowId);

    const url = `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(settings.metaCapiAccessToken)}`;
    const outcome = await postToMetaWithRetry(url, payload);

    if (outcome.ok) {
      if (logRowId) await supabaseService.from("purchase_tracking_log").update({ capi_accepted_at: new Date().toISOString() }).eq("id", logRowId);
      return { ok: true };
    }

    // Release the claim so a genuine retry (the next webhook redelivery, or the 5-minute/daily
    // reconciliation sweeps) can try again instead of being permanently marked "sent" when Meta
    // actually rejected it.
    await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
    if (logRowId) await supabaseService.from("purchase_tracking_log").update({ capi_error: outcome.error }).eq("id", logRowId);
    return { ok: false, error: outcome.error };
  } catch (err) {
    await supabaseService.from("orders").update({ purchase_event_sent_at: null }).eq("id", orderId);
    const message = `Unexpected error reporting purchase: ${(err as Error).message}`;
    if (logRowId) await supabaseService.from("purchase_tracking_log").update({ capi_error: message }).eq("id", logRowId);
    return { ok: false, error: message };
  }
}
