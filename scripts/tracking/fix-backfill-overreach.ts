// Corrects a bug in the one-time scripts/tracking/backfill-register.ts run: that script hit
// 17TRACK's account quota partway through registering numbers (after ~197), but still read back
// and wrote tracking_cache rows for the remaining ~154 fulfillments that were NEVER actually sent
// to /register. Those rows falsely show tracking_api_registered_at set, which would permanently
// stop the app from ever attempting a real registration for them (lookup.ts and sync-orders.ts
// both skip fulfillments that already have a tracking_cache row). This deletes exactly those
// falsely-marked rows so they revert to "never looked up" and get a real registration attempt the
// next time a customer checks or an order syncs, once quota allows.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const ids: string[] = JSON.parse(readFileSync(process.argv[2], "utf-8"));
  console.log(`Deleting ${ids.length} falsely-marked tracking_cache rows...`);

  // Sanity check before deleting: every row must carry the exact timestamp the buggy run wrote,
  // and empty events -- refuse to touch anything that looks like real data.
  const { data: rows, error: readErr } = await supabase
    .from("tracking_cache")
    .select("fulfillment_id, tracking_api_registered_at, events")
    .in("fulfillment_id", ids);
  if (readErr) throw readErr;
  const bad = (rows ?? []).filter((r) => r.tracking_api_registered_at !== "2026-10-12T13:40:32.965+00:00" || (r.events as unknown[]).length > 0);
  if (bad.length) {
    console.error(`Refusing to proceed: ${bad.length} rows don't match the expected buggy signature.`, bad.slice(0, 5));
    process.exit(1);
  }
  console.log(`Verified all ${rows?.length ?? 0} rows match the buggy signature exactly.`);

  const { error: delErr, count } = await supabase.from("tracking_cache").delete({ count: "exact" }).in("fulfillment_id", ids);
  if (delErr) throw delErr;
  console.log(`Deleted ${count} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
