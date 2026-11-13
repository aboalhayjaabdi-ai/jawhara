// Fills the new_shopify_* id columns (migration 0049) from the old -> new mapping written by
// verify-catalog.ts, so the site can switch to the new store with SHOPIFY_ACTIVE_STORE=new.
//
// Writes ONLY the new_shopify_* columns. The legacy shopify_* columns the live site uses are never
// written. Dry run by default; pass --write to apply. Idempotent.
//
// Usage: npx tsx scripts/new-shopify/fill-new-store-ids.ts <mapping.json> [--write]
import { readFileSync } from "node:fs";
import { supabaseService as db } from "../../lib/supabase/service-client.ts";
import { newShopifyGraphQL } from "./client.ts";

const mapPath = process.argv[2];
if (!mapPath) throw new Error("usage: fill-new-store-ids.ts <mapping.json> [--write]");
const write = process.argv.includes("--write");
const mapping = JSON.parse(readFileSync(mapPath, "utf8")) as { products: Record<string, string>; variants: Record<string, string> };

async function all(table: string, select: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data!);
    if (data!.length < 1000) break;
  }
  return rows;
}

const products = await all("products", "id, handle, status, shopify_product_id, new_shopify_product_id");
const variants = await all("product_variants", "id, shopify_variant_id, new_shopify_variant_id");

type Change = { table: string; id: string; column: string; value: string };
const changes: Change[] = [];
const unmapped: string[] = [];
for (const p of products) {
  const target = p.shopify_product_id ? mapping.products[p.shopify_product_id] : undefined;
  if (!target) { unmapped.push(`product ${p.handle} [${p.status}]`); continue; }
  if (p.new_shopify_product_id !== target) changes.push({ table: "products", id: p.id, column: "new_shopify_product_id", value: target });
}
let unmappedVariants = 0;
for (const v of variants) {
  const target = v.shopify_variant_id ? mapping.variants[v.shopify_variant_id] : undefined;
  if (!target) { unmappedVariants++; continue; }
  if (v.new_shopify_variant_id !== target) changes.push({ table: "product_variants", id: v.id, column: "new_shopify_variant_id", value: target });
}

// Discounts: only rows already linked to a legacy Shopify discount; matched by title in the new store.
const discounts = await all("discounts", "id, title, shopify_discount_id, new_shopify_discount_id");
const nd = await newShopifyGraphQL(`{ discountNodes(first:100){ nodes { id discount { ... on DiscountAutomaticBxgy { title } ... on DiscountCodeBasic { title } ... on DiscountAutomaticBasic { title } ... on DiscountCodeBxgy { title } } } } }`);
const newDiscountByTitle = new Map<string, string>(nd.discountNodes.nodes.map((n: any) => [n.discount.title, n.id]));
for (const d of discounts) {
  if (!d.shopify_discount_id) continue;
  const target = newDiscountByTitle.get(d.title);
  if (!target) { unmapped.push(`discount "${d.title}"`); continue; }
  if (d.new_shopify_discount_id !== target) changes.push({ table: "discounts", id: d.id, column: "new_shopify_discount_id", value: target });
}

const count = (t: string) => changes.filter((c) => c.table === t).length;
console.log(`${products.length} products, ${variants.length} variants, ${discounts.length} discounts in Supabase.`);
console.log(`To set: ${count("products")} products, ${count("product_variants")} variants, ${count("discounts")} discounts.`);
console.log(`Without a new-store id: ${unmapped.length} (${unmapped.join(", ") || "none"}), ${unmappedVariants} variants.`);

if (!write) {
  console.log("Dry run. Nothing written. Pass --write to apply.");
} else {
  let done = 0;
  for (const c of changes) {
    const { error } = await db.from(c.table).update({ [c.column]: c.value }).eq("id", c.id);
    if (error) throw new Error(`${c.table} ${c.id}: ${error.message}`);
    if (++done % 200 === 0) console.log(`  ...${done}/${changes.length}`);
  }
  console.log(`Written: ${done}.`);
}
