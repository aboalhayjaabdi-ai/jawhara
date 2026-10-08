import { insertMany, selectAll } from "../rest.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

// This store has a single location, and variant.inventoryQuantity is already the
// total across locations, so each variant gets one inventory_levels row against
// that single location (matches what Phase 1 found: 1 "Shop location").
const products = readJsonl("products");
const locations = await selectAll<{ id: string }>("locations", "select=id");
if (locations.length !== 1) {
  console.warn(`⚠ expected exactly 1 location, found ${locations.length} — using the first one`);
}
const locationId = locations[0]?.id;
if (!locationId) throw new Error("No location found — run 01-locations.ts first");

const variantIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("product_variants", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

const rows: any[] = [];
for (const p of products) {
  for (const edge of p.variants.edges) {
    const variantId = variantIdByShopify.get(idTail(edge.node.id)!);
    if (variantId) rows.push({ variant_id: variantId, location_id: locationId, available: edge.node.inventoryQuantity ?? 0 });
  }
}

let inserted = 0;
for (const batch of chunk(rows, 300)) {
  inserted += await insertMany("inventory_levels", batch, "variant_id,location_id");
}
console.log(`✓ inventory_levels: ${inserted} rows inserted`);
