// Phase 2 requirement: "Make sure Shopify products are available through the Storefront API."
// Checks every (active, Shopify-mapped) variant in Supabase against the real Storefront API --
// reports variants the Storefront API can't see at all (not published to a Storefront-exposed
// sales channel) separately from ones it sees but marks unavailable (stock/status), so the
// difference between "needs a publish in Shopify Admin" and "actually out of stock" is clear.
import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { runSql } from "../supabase/db.ts";

config({ path: ".env.local" });

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}. Copy .env.local.example to .env.local and fill it in.`);
  return value;
}

const DOMAIN = process.env.SHOPIFY_STOREFRONT_DOMAIN ?? requireEnv("SHOPIFY_STORE_DOMAIN");
const TOKEN = requireEnv("SHOPIFY_STOREFRONT_ACCESS_TOKEN");
const API_VERSION = "2026-10";

async function storefrontGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Storefront API error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error(`Storefront API returned no data (HTTP ${res.status}): ${JSON.stringify(json)}`);
  return json.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const rows = await runSql<{ shopify_id: string; title: string; product_title: string; product_status: string }[]>(
  `select pv.shopify_id, pv.title, p.title as product_title, p.status as product_status
   from product_variants pv join products p on p.id = pv.product_id
   where pv.shopify_id is not null and p.status = 'active'
   order by p.title, pv.title`
);
console.log(`Checking ${rows.length} active, Shopify-mapped variants against the Storefront API (${DOMAIN})...`);

const byGid = new Map(rows.map((r) => [`gid://shopify/ProductVariant/${r.shopify_id}`, r]));
const notFound: typeof rows = [];
const unavailable: (typeof rows)[number][] = [];
let available = 0;

for (const idsBatch of chunk([...byGid.keys()], 100)) {
  const data = await storefrontGraphQL<{
    nodes: Array<{ id: string; availableForSale: boolean; quantityAvailable: number | null; product: { availableForSale: boolean } } | null>;
  }>(
    `query CheckVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          availableForSale
          quantityAvailable
          product { availableForSale }
        }
      }
    }`,
    { ids: idsBatch }
  );

  data.nodes.forEach((node, i) => {
    const gid = idsBatch[i];
    const row = byGid.get(gid)!;
    if (!node) {
      notFound.push(row);
    } else if (!node.availableForSale) {
      unavailable.push(row);
    } else {
      available++;
    }
  });
}

console.log(`\nAvailable for sale via Storefront API: ${available}`);
console.log(`Found but NOT available for sale (stock/publish state): ${unavailable.length}`);
for (const r of unavailable.slice(0, 20)) console.log(`  - ${r.product_title} / ${r.title} (shopify variant ${r.shopify_id})`);
if (unavailable.length > 20) console.log(`  ...and ${unavailable.length - 20} more`);

console.log(`\nNOT FOUND by the Storefront API at all (not published to a Storefront-exposed sales channel): ${notFound.length}`);
for (const r of notFound.slice(0, 20)) console.log(`  - ${r.product_title} / ${r.title} (shopify variant ${r.shopify_id})`);
if (notFound.length > 20) console.log(`  ...and ${notFound.length - 20} more`);

if (notFound.length > 0) {
  console.log(
    `\nFix in Shopify Admin: select the affected product(s) -> "Manage sales channel availability" -> ` +
      `make sure "Online Store" (or whichever channel this app's Storefront API token is scoped to) is checked.`
  );
}
