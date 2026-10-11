import { ProxyAgent, setGlobalDispatcher } from "undici";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/client.ts must never be imported into client code");
}

// Next.js-native port of scripts/shopify/client.ts's token-mint + GraphQL helpers, for the admin
// "Sync from Shopify" button (lib/shopify/sync-orders.ts) -- a separate file rather than a shared
// import because tsconfig.json excludes scripts/**/* and that directory's relative .ts-extension
// imports are a different module-resolution convention than this file's @/-aliased one. Reads
// process.env directly (Next.js already loads .env.local/Vercel env; no dotenv.config() needed).
//
// Same restricted read_orders scope as the CLI version -- see docs/order-reconciliation-report.md.
// This button catches new orders going forward; it does not see anything older than ~60 days
// until read_all_orders is granted to this app (per that report's §4).
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const API_VERSION = "2026-10";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_STORE_DOMAIN/SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET.");
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Failed to mint Shopify access token: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = await getAccessToken();

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as GraphQLResponse<T>;

    const throttled = json.errors?.some((e) => e.message.toLowerCase().includes("throttled"));
    if (throttled && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    if (!json.data) throw new Error(`Shopify GraphQL returned no data: ${JSON.stringify(json)}`);
    return json.data;
  }
  throw new Error("Shopify GraphQL request failed after retry");
}

interface Connection<T> {
  edges: Array<{ cursor: string; node: T }>;
  pageInfo: { hasNextPage: boolean };
}

export async function paginateAll<T>(
  query: string,
  getConnection: (data: unknown) => Connection<T>,
  onPage: (nodes: T[]) => void | Promise<void>,
  pageSize = 50
): Promise<number> {
  let after: string | null = null;
  let total = 0;
  for (;;) {
    const data = await shopifyGraphQL<unknown>(query, { first: pageSize, after });
    const conn = getConnection(data);
    total += conn.edges.length;
    await onPage(conn.edges.map((e) => e.node));
    if (!conn.pageInfo.hasNextPage || conn.edges.length === 0) break;
    after = conn.edges[conn.edges.length - 1].cursor;
  }
  return total;
}
