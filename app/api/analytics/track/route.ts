import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";

const EVENT_TYPES = new Set(["page_view", "view_content", "add_to_cart", "initiate_checkout"]);

function classifyTrafficSource(referrer: string | null): "instagram" | "facebook" | "google" | "direct" | "other" {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (host === "jawhara.se" || host.endsWith(".jawhara.se")) return "direct"; // same-site referrer -- not an external source
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
  if (host.includes("google.")) return "google";
  return "other";
}

/**
 * First-party analytics ingest for the admin "Webbplatsstatistik" section. Public and
 * unauthenticated by design -- every real visitor hits this, not just admins -- same trust model
 * as app/api/checkout/route.ts: records only client-side navigation signals, never anything a
 * visitor could use to forge store data (no prices, no order amounts). Uses the service-role
 * client because analytics_sessions/analytics_events have no anon/authenticated insert policy
 * (admin-only RLS, see supabase/migrations/0042_web_analytics.sql) -- same pattern as
 * orders/webhook_events.
 *
 * Always upserts the session row first (ignoring a conflict) before inserting the event, on every
 * call, not just a client-flagged "first" one -- this is what keeps analytics_events' session_id
 * foreign key safe against out-of-order delivery (sendBeacon gives no ordering guarantee), and
 * means whichever call reaches the server first wins that session's landing_path/traffic_source;
 * every later call for the same session is a cheap no-op insert.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventType = typeof body.eventType === "string" ? body.eventType : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : null;
  const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 128) : null;
  if (!eventType || !EVENT_TYPES.has(eventType) || !sessionId || !visitorId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 2048) : null;
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 2048) : null;
  const productHandle = typeof body.productHandle === "string" ? body.productHandle.slice(0, 256) : null;
  const productTitle = typeof body.productTitle === "string" ? body.productTitle.slice(0, 512) : null;

  await supabaseService
    .from("analytics_sessions")
    .upsert(
      { id: sessionId, visitor_id: visitorId, traffic_source: classifyTrafficSource(referrer), landing_path: path },
      { onConflict: "id", ignoreDuplicates: true }
    );

  await supabaseService
    .from("analytics_events")
    .insert({ session_id: sessionId, event_type: eventType, path, product_handle: productHandle, product_title: productTitle });

  return new NextResponse(null, { status: 204 });
}
