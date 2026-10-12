// One-time backfill: registers every existing fulfillment's tracking number with 17TRACK that has
// never been registered before. Without this, each of those orders' customer would be the one to
// hit 17TRACK's first-sync lag (a few minutes after registration before carrier history is pulled)
// on their own first lookup -- see lib/tracking/lookup.ts's registerFulfillmentsForTracking, which
// now does this automatically for every *new* fulfillment going forward. This script closes the gap
// for fulfillments that already existed before that wiring went in.
//
// Two passes, same as 17TRACK's own documented flow: register everything first, then read back
// track info in a second pass once 17TRACK has had time to do its first poll of each carrier.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const API_BASE = "https://api.17track.net/track/v2.4";
const ALREADY_REGISTERED_CODE = -18019901;
const BATCH_SIZE = 40; // 17TRACK's documented per-call limit for register/gettrackinfo

async function post(path: string, body: unknown): Promise<any> {
  const apiKey = process.env.SEVENTEENTRACK_API_KEY!;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "17token": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Row = { id: string; tracking_number: string; tracking_company: string | null };

async function main() {
  const { data: fulfillments, error: fErr } = await supabase
    .from("fulfillments")
    .select("id, tracking_number, tracking_company")
    .not("tracking_number", "is", null);
  if (fErr) throw fErr;

  const { data: cached, error: cErr } = await supabase.from("tracking_cache").select("fulfillment_id");
  if (cErr) throw cErr;
  const cachedIds = new Set((cached ?? []).map((c) => c.fulfillment_id));

  const { data: carriers } = await supabase.from("shipping_carriers").select("name, tracking_api_carrier_code");
  const carrierCodeByName = new Map(
    (carriers ?? []).filter((c) => c.tracking_api_carrier_code != null).map((c) => [c.name.trim().toLowerCase(), c.tracking_api_carrier_code as number])
  );

  const rows: Row[] = (fulfillments ?? [])
    .filter((f) => f.tracking_number && !cachedIds.has(f.id))
    .map((f) => ({ id: f.id, tracking_number: f.tracking_number!, tracking_company: f.tracking_company }));

  console.log(`${fulfillments?.length ?? 0} fulfillments have a tracking number, ${cachedIds.size} already registered, ${rows.length} to back-fill.`);
  if (rows.length === 0) return;

  // --- Pass 1: register everything ---
  let registered = 0;
  let rejected: Array<{ number: string; code: number; message: string }> = [];
  let quotaHit = false;

  for (const batch of chunk(rows, BATCH_SIZE)) {
    if (quotaHit) break;
    const body = batch.map((r) => {
      const carrier = r.tracking_company ? carrierCodeByName.get(r.tracking_company.trim().toLowerCase()) : undefined;
      return carrier != null ? { number: r.tracking_number, carrier } : { number: r.tracking_number };
    });
    const res = await post("/register", body);
    if (res.code !== 0) {
      console.error(`Batch register failed, code ${res.code}:`, JSON.stringify(res).slice(0, 500));
      break;
    }
    for (const a of res.data?.accepted ?? []) registered += 1;
    for (const r of res.data?.rejected ?? []) {
      if (r.error?.code === ALREADY_REGISTERED_CODE) {
        registered += 1; // already registered elsewhere -- fine, we'll still read it back below
        continue;
      }
      rejected.push({ number: r.number, code: r.error?.code ?? 0, message: r.error?.message ?? "" });
      // Stop the whole backfill the moment we see anything that looks like a quota/limit error,
      // rather than silently burning through a capped plan.
      if (/limit|quota|exceed/i.test(r.error?.message ?? "")) quotaHit = true;
    }
    console.log(`register: ${registered} ok so far, ${rejected.length} rejected${quotaHit ? " (quota hit, stopping registration)" : ""}`);
  }

  if (rejected.length) console.log("rejected numbers:", JSON.stringify(rejected.slice(0, 20)));

  // --- Give 17TRACK time to do its first poll of each newly-registered number ---
  const waitMs = quotaHit ? 0 : 3 * 60_000;
  if (waitMs > 0) {
    console.log(`Waiting ${waitMs / 60_000} minutes for 17TRACK's first sync pass...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // --- Pass 2: read back and write tracking_cache for everything we successfully registered ---
  const rejectedNumbers = new Set(rejected.map((r) => r.number));
  const toPoll = rows.filter((r) => !rejectedNumbers.has(r.tracking_number));
  const byNumber = new Map(toPoll.map((r) => [r.tracking_number, r]));

  let written = 0;
  let stillNoData = 0;
  for (const batch of chunk(toPoll, BATCH_SIZE)) {
    const body = batch.map((r) => ({ number: r.tracking_number }));
    const res = await post("/gettrackinfo", body);
    if (res.code !== 0) {
      console.error(`Batch gettrackinfo failed, code ${res.code}`);
      continue;
    }
    const now = new Date().toISOString();
    const upsertRows: any[] = [];
    for (const accepted of res.data?.accepted ?? []) {
      const row = byNumber.get(accepted.number);
      if (!row) continue;
      const trackInfo = accepted.track_info;
      const events = [];
      for (const provider of trackInfo?.tracking?.providers ?? []) {
        for (const ev of provider.events ?? []) {
          if (!ev.time_utc) continue;
          events.push({
            timestamp: ev.time_utc,
            status: ev.sub_status ?? trackInfo?.latest_status?.status ?? "InTransit",
            location: ev.location ?? undefined,
            description: ev.description_translation?.description ?? ev.description ?? undefined,
          });
        }
      }
      events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      upsertRows.push({
        fulfillment_id: row.id,
        raw_status: trackInfo ? { status: trackInfo.latest_status?.status ?? "Unknown" } : null,
        events,
        tracking_api_registered_at: now,
        last_polled_at: now,
        updated_at: now,
      });
    }
    for (const rejectedEntry of res.data?.rejected ?? []) {
      const row = byNumber.get(rejectedEntry.number);
      if (!row) continue;
      stillNoData += 1;
      // No carrier data yet -- still mark it registered so the site shows "no events yet" instead
      // of "not available", and so it won't get re-registered on the next sync.
      upsertRows.push({
        fulfillment_id: row.id,
        raw_status: null,
        events: [],
        tracking_api_registered_at: now,
        last_polled_at: now,
        updated_at: now,
      });
    }
    if (upsertRows.length) {
      const { error } = await supabase.from("tracking_cache").upsert(upsertRows, { onConflict: "fulfillment_id" });
      if (error) {
        console.error("tracking_cache upsert failed:", error.message);
      } else {
        written += upsertRows.length;
      }
    }
    console.log(`gettrackinfo: ${written} cache rows written so far (${stillNoData} with no carrier data yet)`);
  }

  console.log(`\nDone. ${written} fulfillments backfilled, ${stillNoData} registered but no carrier data yet, ${rejected.length} rejected.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
