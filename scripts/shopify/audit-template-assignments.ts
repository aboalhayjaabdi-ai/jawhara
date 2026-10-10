// Read-only live pull of templateSuffix per product -- this field was never captured in the
// original extraction (data/exports/products.jsonl has no templateSuffix key at all), discovered
// while auditing the category-specific product template requirement. Saves a mapping file for
// the audit report; does not touch Supabase or Shopify.
import { paginateAll } from "./client.ts";
import { writeFileSync } from "node:fs";

const QUERY = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          handle
          title
          status
          templateSuffix
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

type ProductNode = { id: string; handle: string; title: string; status: string; templateSuffix: string | null };

const rows: ProductNode[] = [];

await paginateAll<ProductNode>(
  QUERY,
  (data: any) => data.products,
  async (nodes) => {
    rows.push(...nodes);
  }
);

console.log(`Pulled templateSuffix for ${rows.length} products.\n`);

const byTemplate = new Map<string, number>();
for (const r of rows) {
  const key = r.templateSuffix || "(default)";
  byTemplate.set(key, (byTemplate.get(key) ?? 0) + 1);
}
console.log("Distribution:");
for (const [k, v] of [...byTemplate.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

writeFileSync(
  "/tmp/claude-0/-home-user-jawhara/43e7719e-72e9-55e9-b0e0-b6a65106ff99/scratchpad/template-assignments.json",
  JSON.stringify(rows, null, 2)
);
console.log("\nSaved full mapping to scratchpad/template-assignments.json");
