// Safe, read-mostly, full-coverage cart test: builds real Shopify Storefront carts (cartCreate)
// containing EVERY live variant from the just-pulled full catalog (not a sample), in batches, and
// reports which ones Shopify's own Storefront API fails to resolve as real purchasable
// merchandise. Never completes a checkout or payment -- cartCreate only ever builds a cart object
// and a checkoutUrl, exactly what happens when any real visitor adds something to their bag.
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

async function sfQuery(query, variables) {
  const res = await fetch(`https://${domain}/api/2026-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const CART_CREATE = `mutation($lines: [CartLineInput!]!) {
  cartCreate(input: { lines: $lines }) {
    cart { id checkoutUrl lines(first: 250) { nodes { merchandise { ... on ProductVariant { id } } } } }
    userErrors { field message code }
  }
}`;

async function main() {
  // Re-pull the full variant list fresh (the audit JSON doesn't carry per-variant ids, only
  // aggregate counts) -- reuse the same Admin API pull logic via a direct re-query is overkill;
  // instead read straight from Shopify again here, lean query (ids + status only).
  const { shopifyGraphQL, paginateAll } = await import("/home/user/jawhara/scripts/shopify/client.ts");
  const Q = `query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges { cursor node { handle status variants(first: 100) { nodes { id } } } }
      pageInfo { hasNextPage }
    }
  }`;
  const allVariants = [];
  await paginateAll(Q, (d) => d.products, (nodes) => {
    for (const p of nodes) {
      if (p.status !== "ACTIVE") continue; // only real, live, purchasable products matter for this test
      for (const v of p.variants.nodes) allVariants.push({ handle: p.handle, variantId: v.id });
    }
  }, 50);

  console.log(`Testing ${allVariants.length} live (ACTIVE) variants via real Storefront cartCreate calls...`);

  const BATCH = 100; // stay well under Shopify's per-cart line limit
  const failures = [];
  let totalOk = 0;
  for (let i = 0; i < allVariants.length; i += BATCH) {
    const batch = allVariants.slice(i, i + BATCH);
    const lines = batch.map((v) => ({ merchandiseId: v.variantId, quantity: 1 }));
    const result = await sfQuery(CART_CREATE, { lines });
    const payload = result.data?.cartCreate;
    if (!payload) {
      console.error("No cartCreate payload, raw:", JSON.stringify(result).slice(0, 500));
      continue;
    }
    const errs = payload.userErrors ?? [];
    if (errs.length === 0) {
      totalOk += batch.length;
    } else {
      for (const e of errs) {
        const idx = e.field?.[2];
        const v = idx != null ? batch[Number(idx)] : null;
        failures.push({ handle: v?.handle ?? "?", variantId: v?.variantId ?? "?", message: e.message, code: e.code });
      }
      // Whatever didn't error in this batch is fine too
      totalOk += batch.length - errs.length;
    }
    console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(allVariants.length / BATCH)}: ${errs.length} failure(s)`);
  }

  console.log(`\n== Cart coverage test result ==`);
  console.log(`Total ACTIVE variants tested: ${allVariants.length}`);
  console.log(`Successfully addable to a real Shopify cart: ${totalOk}`);
  console.log(`Failed (could not be added): ${failures.length}`);
  if (failures.length) console.log(JSON.stringify(failures, null, 1));

  writeFileSync(
    "/tmp/claude-0/-home-user-jawhara/32dcdd96-2a84-522d-af91-3051bb7e3fae/scratchpad/cart_coverage_result.json",
    JSON.stringify({ total: allVariants.length, ok: totalOk, failures }, null, 1)
  );
}

main().catch((e) => {
  console.error("FEL:", e);
  process.exit(1);
});
