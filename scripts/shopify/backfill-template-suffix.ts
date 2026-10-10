// Backfills products.template_suffix and collections.template_suffix from a live, read-only
// re-pull of Shopify's real templateSuffix field -- never captured in the original Phase 2
// extraction (same gap class as inventoryItem.tracked). Idempotent: re-running just overwrites
// with the same live values.
import { paginateAll } from "./client.ts";
import { runSql } from "../supabase/db.ts";

const PRODUCTS_QUERY = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges { cursor node { id templateSuffix } }
      pageInfo { hasNextPage }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      edges { cursor node { id templateSuffix } }
      pageInfo { hasNextPage }
    }
  }
`;

function shopifyNumericId(gid: string): string {
  return gid.split("/").pop()!;
}

async function backfillProducts() {
  const rows: { id: string; templateSuffix: string | null }[] = [];
  await paginateAll<any>(PRODUCTS_QUERY, (d: any) => d.products, async (nodes) => rows.push(...nodes));

  let updated = 0;
  for (const r of rows) {
    const shopifyId = shopifyNumericId(r.id);
    const res: any = await runSql(
      `update products set template_suffix = ${r.templateSuffix ? `'${r.templateSuffix}'` : "null"} where shopify_id = '${shopifyId}'`
    );
    updated += res?.length ?? 1;
  }
  console.log(`✓ products.template_suffix backfilled for ${rows.length} products`);
}

async function backfillCollections() {
  const rows: { id: string; templateSuffix: string | null }[] = [];
  await paginateAll<any>(COLLECTIONS_QUERY, (d: any) => d.collections, async (nodes) => rows.push(...nodes));

  for (const r of rows) {
    const shopifyId = shopifyNumericId(r.id);
    await runSql(
      `update collections set template_suffix = ${r.templateSuffix ? `'${r.templateSuffix}'` : "null"} where shopify_id = '${shopifyId}'`
    );
  }
  console.log(`✓ collections.template_suffix backfilled for ${rows.length} collections`);
}

await backfillProducts();
await backfillCollections();

const check: any = await runSql(
  `select template_suffix, count(*) from products group by template_suffix order by count(*) desc`
);
console.log("\nproducts.template_suffix distribution:", JSON.stringify(check));
