import { supabaseService } from "@/lib/supabase/service-client";
import { verifyTrackingToken } from "./token";

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
  | { ok: false; reason: "not_found" | "rate_limited" | "invalid_token" }
  | { ok: true; orderNumber: string; notYetShipped: boolean; shipments: ShipmentTracking[] };

async function loadShipments(orderId: string): Promise<ShipmentTracking[]> {
  const { data: fulfillments } = await supabaseService
    .from("fulfillments")
    .select(
      "id, status, tracking_number, tracking_url, tracking_company, created_at, tracking_cache(events, tracking_api_registered_at)"
    )
    .eq("order_id", orderId)
    .order("created_at");

  return (fulfillments ?? []).map((f: any) => ({
    fulfillmentId: f.id,
    carrier: f.tracking_company ?? null,
    trackingNumber: f.tracking_number ?? null,
    trackingUrl: f.tracking_url ?? null,
    status: f.status,
    events: (f.tracking_cache?.events ?? []) as TrackingEvent[],
    registered: Boolean(f.tracking_cache?.tracking_api_registered_at),
  }));
}

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

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

  const shipments = await loadShipments(order.id);
  return { ok: true, orderNumber: order.order_number, notYetShipped: shipments.length === 0, shipments };
}

/** Verifies the signed per-order token from a shipping-confirmation email's "Spåra mitt paket"
 * link -- no order number/email re-entry needed. The token only ever encodes an order id, so a
 * valid token already proves the holder received the original email; no further rate limiting
 * is needed (unlike the manual form, a token can't be brute-forced to enumerate orders). */
export async function lookupOrderTrackingByToken(token: string): Promise<OrderTrackingResult> {
  const verified = verifyTrackingToken(token);
  if (!verified) return { ok: false, reason: "invalid_token" };

  const { data: order } = await supabaseService.from("orders").select("id, order_number").eq("id", verified.orderId).maybeSingle();
  if (!order) return { ok: false, reason: "invalid_token" };

  const shipments = await loadShipments(order.id);
  return { ok: true, orderNumber: order.order_number, notYetShipped: shipments.length === 0, shipments };
}
