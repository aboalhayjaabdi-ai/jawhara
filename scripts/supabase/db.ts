import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}. Copy .env.local.example to .env.local and fill it in.`);
  return value;
}

const PROJECT_REF = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
const ACCESS_TOKEN = requireEnv("SUPABASE_ACCESS_TOKEN");

/**
 * Executes raw SQL against the project's Postgres database via Supabase's
 * HTTPS Management API (not a direct TCP connection, which this sandboxed
 * environment can't make). Used for schema migrations (DDL) since the Data
 * API (PostgREST) only supports CRUD on existing tables, not DDL.
 */
export async function runSql<T = unknown>(query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Supabase Management API error: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
