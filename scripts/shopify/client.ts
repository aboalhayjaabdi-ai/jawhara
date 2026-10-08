import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });

// Node's native fetch doesn't honor HTTPS_PROXY automatically; this sandboxed
// environment routes all outbound HTTPS through a local proxy.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const STORE_DOMAIN = requireEnv("SHOPIFY_STORE_DOMAIN");
const CLIENT_ID = requireEnv("SHOPIFY_CLIENT_ID");
const CLIENT_SECRET = requireEnv("SHOPIFY_CLIENT_SECRET");
const API_VERSION = "2026-10";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.local.example to .env.local and fill it in.`);
  }
  return value;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to mint Shopify access token: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
}

/**
 * Read-only GraphQL call. Retries once on throttling (code THROTTLED), since large
 * audit/extraction runs can burn through the query-cost budget.
 */
export async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = (await res.json()) as GraphQLResponse<T>;

    const throttled = json.errors?.some((e) => e.message.toLowerCase().includes("throttled"));
    if (throttled && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    if (!json.data) {
      throw new Error(`Shopify GraphQL returned no data: ${JSON.stringify(json)}`);
    }
    return json.data;
  }

  throw new Error("Shopify GraphQL request failed after retry");
}

export const STORE = { domain: STORE_DOMAIN };

interface Connection<T> {
  edges: Array<{ cursor: string; node: T }>;
  pageInfo: { hasNextPage: boolean };
}

/**
 * Follows a paginated connection to completion, calling onPage after each page
 * so callers can persist progress incrementally (resumability on crash/interrupt).
 * `query` must accept an `$after: String` variable and request `cursor` on each edge
 * plus `pageInfo { hasNextPage }` on the connection.
 */
export async function paginateAll<T>(
  query: string,
  getConnection: (data: unknown) => Connection<T>,
  onPage: (nodes: T[], pageNum: number) => void | Promise<void>,
  pageSize = 50
): Promise<number> {
  let after: string | null = null;
  let pageNum = 0;
  let total = 0;

  for (;;) {
    const data = await shopifyGraphQL<unknown>(query, { first: pageSize, after });
    const conn = getConnection(data);
    pageNum += 1;
    total += conn.edges.length;
    await onPage(
      conn.edges.map((e) => e.node),
      pageNum
    );
    if (!conn.pageInfo.hasNextPage || conn.edges.length === 0) break;
    after = conn.edges[conn.edges.length - 1].cursor;
  }

  return total;
}
