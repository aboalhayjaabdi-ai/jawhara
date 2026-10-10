// One-off remediation script: re-pulls inventoryItem.tracked, inventoryPolicy, and product status
// live from Shopify for every product/variant (read-only), and backfills product_variants
// .inventory_tracked (new column) + re-syncs inventory_policy/products.status in case of drift
// since the original extraction. Never touches inventory_quantity or price -- those are untouched.
import { paginateAll } from "./client.ts";
import { runSql } from "../supabase/db.ts";

// Supabase stores shopify_id as just the numeric GID tail (see scripts/supabase/import/util.ts
// idTail), not the full "gid://shopify/..." string -- matching on the full GID would silently
// match nothing and leave every row at the migration's column default, which is exactly the bug
// a first version of this script had (caught before any corrupted data was treated as real).
function idTail(gid: string): string {
  return gid.split("/").pop()!;
}

const QUERY = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          status
          variants(first: 100) {
            edges {
              node {
                id
                inventoryPolicy
                inventoryItem { tracked }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

type ProductNode = {
  id: string;
  status: string;
  variants: { edges: { node: { id: string; inventoryPolicy: string; inventoryItem: { tracked: boolean } } }[] };
};

const rows: { productShopifyId: string; status: string; variantShopifyId: string; policy: string; tracked: boolean }[] = [];

const total = await paginateAll<ProductNode>(
  QUERY,
  (data: any) => data.products,
  async (nodes) => {
    for (const p of nodes) {
      for (const e of p.variants.edges) {
        rows.push({
          productShopifyId: idTail(p.id),
          status: p.status,
          variantShopifyId: idTail(e.node.id),
          policy: e.node.inventoryPolicy,
          tracked: e.node.inventoryItem.tracked,
        });
      }
    }
  }
);

console.log(`Pulled ${rows.length} variants across live products (paginated total events: ${total}).`);

// Backfill in batches via a single SQL statement per batch (CASE/WHEN on shopify_id), since
// PostgREST's bulk-update API can't express "different value per row" in one request and 788
// individual HTTP round-trips would be slow -- this runs through the same Management API SQL
// path already used for all schema/data work in this sandboxed environment.
const BATCH = 200;
let updated = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const trackedCases = batch.map((r) => `when '${r.variantShopifyId}' then ${r.tracked}`).join(" ");
  const policyCases = batch.map((r) => `when '${r.variantShopifyId}' then '${r.policy}'`).join(" ");
  const ids = batch.map((r) => `'${r.variantShopifyId}'`).join(",");
  const sql = `
    update product_variants set
      inventory_tracked = case shopify_id ${trackedCases} end,
      inventory_policy = case shopify_id ${policyCases} end
    where shopify_id in (${ids});
  `;
  await runSql(sql);
  updated += batch.length;
  console.log(`  ${updated}/${rows.length} variants backfilled...`);
}

// Re-sync product status too, same batching approach.
const productMap = new Map<string, string>();
for (const r of rows) productMap.set(r.productShopifyId, r.status);
const productEntries = [...productMap.entries()];
for (let i = 0; i < productEntries.length; i += BATCH) {
  const batch = productEntries.slice(i, i + BATCH);
  const statusCases = batch.map(([id, status]) => `when '${id}' then '${status.toLowerCase()}'`).join(" ");
  const ids = batch.map(([id]) => `'${id}'`).join(",");
  await runSql(`update products set status = case shopify_id ${statusCases} end where shopify_id in (${ids});`);
}
console.log(`Re-synced status for ${productEntries.length} products.`);

const summary = await runSql<any[]>(`
  select inventory_tracked, inventory_policy, count(*) from product_variants group by 1, 2 order by 1, 2;
`);
console.table(summary);
