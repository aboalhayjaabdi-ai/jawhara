import { after } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { refreshTrackingCache } from "@/lib/tracking/seventeentrack";

export type TrackingEvent = { timestamp: string; status: string; location?: string; description?: string };

export type ShipmentTracking = {
  fulfillmentId: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  events: TrackingEvent[];
  // True once this shipment has been registered with the 17TRACK API and is receiving real
  // status updates. False (not an error) whenever that integration isn't configured yet, or
  // hasn't registered this specific shipment -- the page shows "skickad" with no live events.
  registered: boolean;
};

export type OrderTrackingResult =
  | { ok: false; reason: "not_found" | "rate_limited" }
  | { ok: true; orderNumber: string; notYetShipped: boolean; shipments: ShipmentTracking[] };

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
// gettrackinfo re-reads are free (17TRACK already polls the carrier on its own schedule), so this
// just caps how often we hit their API, not a cost concern.
const CACHE_STALE_AFTER_MINUTES = 15;

/** Caps lookups per IP (not per order number -- an attacker trying many order numbers against
 * one email, or many emails against one order number, is capped the same way either direction). */
async function checkRateLimit(ipAddress: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabaseService
    .from("tracking_lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("attempted_at", since);
  return (count ?? 0) < RATE_LIMIT_MAX_ATTEMPTS;
}

/** Verifies order number + email match server-side before revealing anything. Never discloses
 * *why* a lookup failed (wrong email vs. no such order) -- both return the same generic result,
 * to prevent order-number enumeration. */
export async function lookupOrderTracking(orderNumber: string, email: string, ipAddress: string): Promise<OrderTrackingResult> {
  const allowed = await checkRateLimit(ipAddress);
  await supabaseService.from("tracking_lookup_attempts").insert({ ip_address: ipAddress, order_number: orderNumber.trim() });
  if (!allowed) return { ok: false, reason: "rate_limited" };

  const normalizedOrderNumber = orderNumber.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedOrderNumber || !normalizedEmail) return { ok: false, reason: "not_found" };

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email")
    .eq("order_number", normalizedOrderNumber)
    .maybeSingle();

  if (!order || !order.email || order.email.toLowerCase() !== normalizedEmail) {
    return { ok: false, reason: "not_found" };
  }

  const { data: fulfillments } = await supabaseService
    .from("fulfillments")
    .select(
      "id, status, tracking_number, tracking_url, tracking_company, created_at, tracking_cache(events, tracking_api_registered_at, last_polled_at)"
    )
    .eq("order_id", order.id)
    .order("created_at");

  const carrierCodeByName = await loadCarrierCodesByName();

  const shipments: ShipmentTracking[] = (fulfillments ?? []).map((f: any) => {
    const cache = f.tracking_cache;
    const alreadyRegistered = Boolean(cache?.tracking_api_registered_at);

    if (f.tracking_number && isCacheStale(cache?.last_polled_at)) {
      const carrierCode = f.tracking_company ? carrierCodeByName.get(normalizeCarrierName(f.tracking_company)) ?? null : null;
      after(() => refreshTrackingCache(f.id, f.tracking_number, carrierCode, alreadyRegistered));
    }

    return {
      fulfillmentId: f.id,
      carrier: f.tracking_company ?? null,
      trackingNumber: f.tracking_number ?? null,
      trackingUrl: f.tracking_url ?? null,
      status: f.status,
      events: (cache?.events ?? []) as TrackingEvent[],
      registered: alreadyRegistered,
    };
  });

  return { ok: true, orderNumber: order.order_number, notYetShipped: shipments.length === 0, shipments };
}

function isCacheStale(lastPolledAt: string | null | undefined): boolean {
  if (!lastPolledAt) return true;
  return Date.now() - new Date(lastPolledAt).getTime() > CACHE_STALE_AFTER_MINUTES * 60_000;
}

function normalizeCarrierName(name: string): string {
  return name.trim().toLowerCase();
}

/** Registers tracking numbers with 17TRACK as soon as a fulfillment gets one -- at fulfillment
 * creation or Shopify sync, not at a customer's first lookup. Without this, the customer who
 * happens to be the first to check an order's tracking is also the one who hits 17TRACK's first-
 * sync lag (it needs a few minutes after registration to backfill carrier history). Call this
 * right after the fulfillment rows are written so that gap is already closed by the time anyone
 * actually looks. Safe to call for fulfillments that are already registered -- 17TRACK's own
 * register endpoint treats that as a no-op, and refreshTrackingCache never throws. */
export async function registerFulfillmentsForTracking(
  fulfillments: Array<{ id: string; trackingNumber: string | null; trackingCompany: string | null }>
): Promise<void> {
  const withTracking = fulfillments.filter((f) => f.trackingNumber);
  if (withTracking.length === 0) return;

  const carrierCodeByName = await loadCarrierCodesByName();
  for (const f of withTracking) {
    const carrierCode = f.trackingCompany ? carrierCodeByName.get(normalizeCarrierName(f.trackingCompany)) ?? null : null;
    after(() => refreshTrackingCache(f.id, f.trackingNumber!, carrierCode, false));
  }
}

/** shipping_carriers.tracking_api_carrier_code is set per-carrier in the admin (once the real
 * 17TRACK code is looked up) -- fulfillments.tracking_company is free text copied at fulfillment
 * creation (see components/admin/fulfillment-form.tsx), not a foreign key, so carriers are
 * matched by name. Unmatched or uncoded carriers fall back to 17TRACK's own auto-detection. */
async function loadCarrierCodesByName(): Promise<Map<string, number>> {
  const { data } = await supabaseService.from("shipping_carriers").select("name, tracking_api_carrier_code");
  const map = new Map<string, number>();
  for (const c of data ?? []) {
    if (c.tracking_api_carrier_code != null) map.set(normalizeCarrierName(c.name), c.tracking_api_carrier_code);
  }
  return map;
}
