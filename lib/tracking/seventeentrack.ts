import { ProxyAgent, setGlobalDispatcher } from "undici";
import { supabaseService } from "@/lib/supabase/service-client";
import type { TrackingEvent } from "@/lib/tracking/lookup";

// Server-only: 17TRACK's Security Key (SEVENTEENTRACK_API_KEY) must never reach the browser bundle.
if (typeof window !== "undefined") {
  throw new Error("lib/tracking/seventeentrack.ts must never be imported into client code");
}

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const API_BASE = "https://api.17track.net/track/v2.4";
// "Tracking number {0} is already registered." -- treated as success so a cache refresh that
// races a previous registration (or re-registers after a crashed run) never fails loudly.
const ALREADY_REGISTERED_CODE = -18019901;

type SeventeenTrackEvent = {
  time_utc: string | null;
  description: string | null;
  description_translation?: { lang: string; description: string } | null;
  location: string | null;
  sub_status: string | null;
};

type SeventeenTrackAccepted = {
  number: string;
  track_info?: {
    latest_status?: { status: string };
    tracking?: { providers?: Array<{ events?: SeventeenTrackEvent[] }> };
  };
};

type SeventeenTrackResponse = {
  code: number;
  data?: {
    accepted?: SeventeenTrackAccepted[];
    rejected?: Array<{ number: string; error?: { code: number; message: string } }>;
  };
};

async function post(path: string, body: unknown): Promise<SeventeenTrackResponse> {
  const apiKey = process.env.SEVENTEENTRACK_API_KEY;
  if (!apiKey) throw new Error("SEVENTEENTRACK_API_KEY is not set.");

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "17token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`17TRACK ${path} returned HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Registers a tracking number so 17TRACK starts polling the carrier for it. `carrier` is the
 * numeric code from shipping_carriers.tracking_api_carrier_code -- omitted (auto-detect) when a
 * carrier hasn't had its code looked up yet in the admin. */
export async function registerTracking(number: string, carrier: number | null): Promise<boolean> {
  const body: Record<string, unknown> = { number };
  if (carrier != null) body.carrier = carrier;

  const res = await post("/register", [body]);
  if (res.code !== 0) return false;
  if (res.data?.accepted?.some((a) => a.number === number)) return true;
  const rejected = res.data?.rejected?.find((r) => r.number === number);
  return rejected?.error?.code === ALREADY_REGISTERED_CODE;
}

/** Reads back 17TRACK's current stored status/events for an already-registered number -- this
 * is a free re-read of data 17TRACK already polled from the carrier, not a new carrier query, so
 * it carries no tracking-quota cost. */
export async function getTrackInfo(
  number: string,
  carrier: number | null
): Promise<{ status: string; events: TrackingEvent[] } | null> {
  const body: Record<string, unknown> = { number };
  if (carrier != null) body.carrier = carrier;

  const res = await post("/gettrackinfo", [body]);
  if (res.code !== 0) return null;

  const trackInfo = res.data?.accepted?.find((a) => a.number === number)?.track_info;
  if (!trackInfo) return null;

  const events: TrackingEvent[] = [];
  for (const provider of trackInfo.tracking?.providers ?? []) {
    for (const ev of provider.events ?? []) {
      if (!ev.time_utc) continue;
      events.push({
        timestamp: ev.time_utc,
        // sub_status (e.g. "InTransit_Other", "InfoReceived") is populated on every event in
        // practice, unlike the per-event "stage" field, which is often null -- confirmed against
        // a real 17TRACK response.
        status: ev.sub_status ?? trackInfo.latest_status?.status ?? "InTransit",
        location: ev.location ?? undefined,
        description: ev.description_translation?.description ?? ev.description ?? undefined,
      });
    }
  }
  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return { status: trackInfo.latest_status?.status ?? "Unknown", events };
}

/** Brings one fulfillment's tracking_cache row up to date from the live 17TRACK API. Meant to
 * run via Next's after() on a customer lookup request -- never throws, since a failed refresh
 * must not take down the cached data the customer is already looking at. */
export async function refreshTrackingCache(
  fulfillmentId: string,
  trackingNumber: string,
  carrierCode: number | null,
  alreadyRegistered: boolean
): Promise<void> {
  try {
    if (!alreadyRegistered) {
      const registered = await registerTracking(trackingNumber, carrierCode);
      if (!registered) return;
    }

    const info = await getTrackInfo(trackingNumber, carrierCode);
    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      fulfillment_id: fulfillmentId,
      raw_status: info ? { status: info.status } : null,
      events: info?.events ?? [],
      last_polled_at: now,
      updated_at: now,
    };
    // Only set on first successful registration -- omitted on later refreshes so the upsert
    // doesn't clobber the original registration timestamp.
    if (!alreadyRegistered) update.tracking_api_registered_at = now;

    await supabaseService.from("tracking_cache").upsert(update, { onConflict: "fulfillment_id" });
  } catch (err) {
    console.error(`17TRACK refresh failed for fulfillment ${fulfillmentId}:`, err);
  }
}
