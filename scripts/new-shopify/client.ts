// Admin API client for the NEW Shopify store (the migration target).
//
// Deliberately separate from lib/shopify/client.ts and scripts/shopify/client.ts, which talk to
// the OLD store that the live site and checkout still use. This file reads only NEW_SHOPIFY_*
// variables, so nothing here can write to the old store by accident.
//
// scripts/**/* is excluded from tsconfig.json, so this never reaches the Next.js build.
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

export const API_VERSION = "2026-10";

const DOMAIN = process.env.NEW_SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.NEW_SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.NEW_SHOPIFY_CLIENT_SECRET;

if (!DOMAIN || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Missing NEW_SHOPIFY_STORE_DOMAIN / NEW_SHOPIFY_CLIENT_ID / NEW_SHOPIFY_CLIENT_SECRET.");
}
if (DOMAIN === process.env.SHOPIFY_STORE_DOMAIN) {
  throw new Error("NEW_SHOPIFY_STORE_DOMAIN equals the live store's domain. Refusing to run.");
}

export const NEW_STORE_DOMAIN = DOMAIN;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Failed to mint new-store token: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function newShopifyGraphQL<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const token = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string; extensions?: any }>; extensions?: any };
    const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED" || e.message.toLowerCase().includes("throttled"));
    if (throttled) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (json.errors?.length) throw new Error(`New-store GraphQL error: ${JSON.stringify(json.errors).slice(0, 1500)}`);
    // Stay well inside the cost bucket.
    const avail = json.extensions?.cost?.throttleStatus?.currentlyAvailable;
    if (typeof avail === "number" && avail < 200) await sleep(1500);
    return json.data as T;
  }
  throw new Error("New-store GraphQL request failed after retries");
}

export async function grantedScopes(): Promise<string[]> {
  const d = await newShopifyGraphQL<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(
    `{ currentAppInstallation { accessScopes { handle } } }`
  );
  return d.currentAppInstallation.accessScopes.map((s) => s.handle);
}
