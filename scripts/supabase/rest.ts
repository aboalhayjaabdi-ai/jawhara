import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const URL_BASE = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

/** Upsert rows into `table`, matching on `onConflict` column(s). Returns the upserted rows. */
export async function upsert<T>(table: string, rows: unknown[], onConflict: string): Promise<T[]> {
  if (rows.length === 0) return [];
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Upsert into ${table} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T[]>;
}

/** Plain insert (not upsert) with merge-duplicates on the given conflict target — used for join tables. */
export async function insertMany(table: string, rows: unknown[], onConflict: string): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Insert into ${table} failed: ${res.status} ${await res.text()}`);
  return rows.length;
}

export async function selectAll<T>(table: string, query = "select=*"): Promise<T[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`Select from ${table} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

export async function countTable(table: string): Promise<number> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=id`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range"); // "0-0/N"
  return range ? Number(range.split("/")[1]) : NaN;
}

/** Builds a map from shopify_id -> local uuid for a table, for resolving foreign keys during import. */
export async function shopifyIdMap(table: string): Promise<Map<string, string>> {
  const rows = await selectAll<{ id: string; shopify_id: string }>(table, "select=id,shopify_id");
  return new Map(rows.filter((r) => r.shopify_id).map((r) => [r.shopify_id, r.id]));
}
