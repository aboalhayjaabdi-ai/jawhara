import { NextRequest, NextResponse } from "next/server";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";
import { postToMetaWithRetry, sha256 } from "@/lib/marketing/capi-purchase";

/**
 * Server-side (Conversions API) mirror of the browser pixel's funnel events -- PageView,
 * ViewContent, AddToCart, InitiateCheckout, Search, Lead. Called by lib/marketing/meta-server-events.ts
 * right after the same event is fired with fbq(), with the SAME event_id, so Meta deduplicates the
 * pair into one event while still getting it when the browser copy is lost (ad blockers, Safari ITP,
 * the page navigating away to Shopify checkout before the pixel request finished).
 *
 * The client only calls this after cookie consent (same gate as the pixel itself). The request's
 * own IP and User-Agent are added here -- the two signals Meta weighs most for matching.
 *
 * Purchase is deliberately NOT accepted here: it is only ever reported from a confirmed Shopify
 * order (lib/marketing/capi-purchase.ts), never from untrusted browser input.
 */

const ALLOWED_EVENTS = new Set(["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Search", "Lead"]);
const FBP_RE = /^fb\.\d\.\d{10,13}\.\d{1,30}$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_\-]{1,500}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;

let settingsCache: { value: Awaited<ReturnType<typeof getMarketingSettings>>; at: number } | null = null;
async function cachedSettings() {
  if (settingsCache && Date.now() - settingsCache.at < 5 * 60_000) return settingsCache.value;
  const value = await getMarketingSettings();
  settingsCache = { value, at: Date.now() };
  return value;
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? v : undefined;
}

function sanitizeCustomData(raw: unknown): Record<string, unknown> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const value = num(r.value);
  if (value !== undefined) out.value = value;
  const currency = str(r.currency, 3);
  if (currency && /^[A-Z]{3}$/.test(currency)) out.currency = currency;
  if (r.content_type === "product") out.content_type = "product";
  const name = str(r.content_name, 200);
  if (name) out.content_name = name;
  const search = str(r.search_string, 200);
  if (search) out.search_string = search;
  const numItems = num(r.num_items);
  if (numItems !== undefined) out.num_items = Math.floor(numItems);
  if (Array.isArray(r.content_ids)) {
    const ids = r.content_ids.filter((id): id is string => typeof id === "string" && ID_RE.test(id)).slice(0, 50);
    if (ids.length) out.content_ids = ids;
  }
  if (Array.isArray(r.contents)) {
    const contents = r.contents
      .map((c: any) => ({ id: typeof c?.id === "string" && ID_RE.test(c.id) ? c.id : null, quantity: num(c?.quantity), item_price: num(c?.item_price) }))
      .filter((c) => c.id && c.quantity)
      .slice(0, 50)
      .map((c) => (c.item_price !== undefined ? c : { id: c.id, quantity: c.quantity }));
    if (contents.length) out.contents = contents;
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Same-origin only: a cross-site page has no business submitting events as this store.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }

  const text = await req.text();
  if (text.length > 8_000) return new NextResponse(null, { status: 413 });
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const eventName = typeof body?.event_name === "string" ? body.event_name : "";
  const eventId = typeof body?.event_id === "string" && /^[A-Za-z0-9_\-]{8,80}$/.test(body.event_id) ? body.event_id : null;
  if (!ALLOWED_EVENTS.has(eventName) || !eventId) return new NextResponse(null, { status: 400 });

  const settings = await cachedSettings();
  if (!settings.metaPixelId || !settings.metaCapiAccessToken) return new NextResponse(null, { status: 204 });

  const userData: Record<string, unknown> = {};
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) userData.client_ip_address = ip;
  const ua = req.headers.get("user-agent");
  if (ua) userData.client_user_agent = ua.slice(0, 500);
  if (typeof body.fbp === "string" && FBP_RE.test(body.fbp)) userData.fbp = body.fbp;
  if (typeof body.fbc === "string" && FBC_RE.test(body.fbc)) userData.fbc = body.fbc;
  if (typeof body.external_id === "string" && /^[A-Za-z0-9\-]{8,64}$/.test(body.external_id)) userData.external_id = [sha256(body.external_id)];
  if (typeof body.em === "string" && SHA256_RE.test(body.em)) userData.em = [body.em];

  let sourceUrl: string | undefined;
  try {
    const u = new URL(String(body.event_source_url ?? ""));
    if (host && u.host === host) sourceUrl = u.toString();
  } catch {
    // ignore
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
        user_data: userData,
        custom_data: sanitizeCustomData(body.custom_data),
      },
    ],
  };

  const url = `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(settings.metaCapiAccessToken)}`;
  const outcome = await postToMetaWithRetry(url, payload, 2);
  if (!outcome.ok) console.error(`Meta CAPI ${eventName} failed: ${outcome.error}`);
  return new NextResponse(null, { status: 204 });
}
