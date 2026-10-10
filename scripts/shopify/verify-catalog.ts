import { readFileSync, existsSync } from "node:fs";
import { runSql } from "../supabase/db.ts";

function idTail(gid: string | undefined | null): string | null {
  return gid ? gid.split("/").pop()! : null;
}

function readJsonl<T = any>(resource: string): T[] {
  return readFileSync(`data/exports/${resource}.jsonl`, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

type Mismatch = { scope: string; shopifyId: string; title: string; field: string; expected: unknown; actual: unknown };
const mismatches: Mismatch[] = [];
function flag(scope: string, shopifyId: string, title: string, field: string, expected: unknown, actual: unknown) {
  mismatches.push({ scope, shopifyId, title, field, expected, actual });
}

// ---------------------------------------------------------------------
// Load source of truth
// ---------------------------------------------------------------------
const products = readJsonl("products");
const collections = readJsonl("collections");
console.log(`Loaded ${products.length} products, ${collections.length} collections from Shopify export.`);

// ---------------------------------------------------------------------
// Pull full Supabase state (unpaginated, via Management API SQL -- no PostgREST row cap)
// ---------------------------------------------------------------------
const dbProducts = await runSql<any[]>(`select shopify_id, title, handle, status, product_type, vendor,
  description_html, tags, seo_title, seo_description, published_at from products`);
const dbVariants = await runSql<any[]>(`select shopify_id, product_id, (select shopify_id from products p where p.id = product_variants.product_id) as product_shopify_id,
  title, sku, barcode, price, compare_at_price, inventory_quantity, inventory_policy, taxable, option1, option2, option3
  from product_variants`);
const dbMedia = await runSql<any[]>(`select m.shopify_id, m.product_id, p.shopify_id as product_shopify_id, m.storage_path, m.position, m.width, m.height
  from media m join products p on p.id = m.product_id order by p.shopify_id, m.position`);
const dbCollections = await runSql<any[]>(`select shopify_id, title, handle, description_html, sort_order, image_url from collections`);
const dbCollectionProducts = await runSql<any[]>(`select c.shopify_id as collection_shopify_id, p.shopify_id as product_shopify_id, cp.position
  from collection_products cp join collections c on c.id = cp.collection_id join products p on p.id = cp.product_id
  order by c.shopify_id, cp.position`);

console.log(
  `Pulled from Supabase: ${dbProducts.length} products, ${dbVariants.length} variants, ${dbMedia.length} media rows, ` +
    `${dbCollections.length} collections, ${dbCollectionProducts.length} collection_products links.`
);

const dbProductBySid = new Map(dbProducts.map((r) => [r.shopify_id, r]));
const dbVariantBySid = new Map(dbVariants.map((r) => [r.shopify_id, r]));
const dbMediaByProductSid = new Map<string, any[]>();
for (const m of dbMedia) {
  const arr = dbMediaByProductSid.get(m.product_shopify_id) ?? [];
  arr.push(m);
  dbMediaByProductSid.set(m.product_shopify_id, arr);
}
const dbCollectionBySid = new Map(dbCollections.map((r) => [r.shopify_id, r]));
const dbCollectionProductsByCollectionSid = new Map<string, any[]>();
for (const cp of dbCollectionProducts) {
  const arr = dbCollectionProductsByCollectionSid.get(cp.collection_shopify_id) ?? [];
  arr.push(cp);
  dbCollectionProductsByCollectionSid.set(cp.collection_shopify_id, arr);
}

// ---------------------------------------------------------------------
// 1. Products: core fields
// ---------------------------------------------------------------------
let productsMissing = 0;
let expectedVariantTotal = 0;
let expectedImageTotal = 0;
let productsAt50Images = 0;

for (const p of products) {
  const sid = idTail(p.id)!;
  const row = dbProductBySid.get(sid);
  if (!row) {
    productsMissing++;
    flag("product", sid, p.title, "<row>", "exists", "MISSING FROM SUPABASE");
    continue;
  }
  const checks: [string, unknown, unknown][] = [
    ["title", p.title, row.title],
    ["handle", p.handle, row.handle],
    ["status", (p.status || "ACTIVE").toLowerCase(), row.status],
    ["product_type", p.productType || null, row.product_type],
    ["vendor", p.vendor || null, row.vendor],
    ["description_html", p.descriptionHtml || null, row.description_html],
    ["seo_title", p.seo?.title ?? null, row.seo_title],
    ["seo_description", p.seo?.description ?? null, row.seo_description],
  ];
  for (const [field, expected, actual] of checks) {
    if (expected !== actual) flag("product", sid, p.title, field, expected, actual);
  }
  const expectedTags = JSON.stringify([...(p.tags || [])].sort());
  const actualTags = JSON.stringify([...(row.tags || [])].sort());
  if (expectedTags !== actualTags) flag("product", sid, p.title, "tags", expectedTags, actualTags);

  // --- variants ---
  const variantEdges = p.variants.edges;
  expectedVariantTotal += variantEdges.length;
  for (const edge of variantEdges) {
    const v = edge.node;
    const vsid = idTail(v.id)!;
    const vrow = dbVariantBySid.get(vsid);
    if (!vrow) {
      flag("variant", vsid, `${p.title} / ${v.title}`, "<row>", "exists", "MISSING FROM SUPABASE");
      continue;
    }
    if (vrow.product_shopify_id !== sid) {
      flag("variant", vsid, `${p.title} / ${v.title}`, "product_id", sid, vrow.product_shopify_id);
    }
    const vchecks: [string, unknown, unknown][] = [
      ["title", v.title, vrow.title],
      ["sku", v.sku || null, vrow.sku],
      ["barcode", v.barcode || null, vrow.barcode],
      ["price", Number(v.price).toFixed(2), Number(vrow.price).toFixed(2)],
      [
        "compare_at_price",
        v.compareAtPrice ? Number(v.compareAtPrice).toFixed(2) : null,
        vrow.compare_at_price !== null ? Number(vrow.compare_at_price).toFixed(2) : null,
      ],
      ["inventory_quantity", v.inventoryQuantity ?? 0, vrow.inventory_quantity],
      ["option1", v.selectedOptions?.[0]?.value ?? null, vrow.option1],
      ["option2", v.selectedOptions?.[1]?.value ?? null, vrow.option2],
      ["option3", v.selectedOptions?.[2]?.value ?? null, vrow.option3],
    ];
    for (const [field, expected, actual] of vchecks) {
      if (String(expected) !== String(actual)) flag("variant", vsid, `${p.title} / ${v.title}`, field, expected, actual);
    }
  }

  // --- images: count + per-image association ---
  const imageEdges = p.images.edges;
  expectedImageTotal += imageEdges.length;
  if (imageEdges.length === 50) productsAt50Images++;
  const actualMedia = dbMediaByProductSid.get(sid) ?? [];
  if (actualMedia.length !== imageEdges.length) {
    flag("product_images", sid, p.title, "image_count", imageEdges.length, actualMedia.length);
  }
  const actualMediaSids = new Set(actualMedia.map((m) => m.shopify_id));
  for (const edge of imageEdges) {
    const isid = idTail(edge.node.id)!;
    if (!actualMediaSids.has(isid)) {
      flag("product_images", sid, p.title, `missing image ${isid}`, "present", "MISSING");
    }
  }
}

// ---------------------------------------------------------------------
// 2. Collections: core fields + membership
// ---------------------------------------------------------------------
let collectionsMissing = 0;
let expectedMembershipTotal = 0;

for (const c of collections) {
  const sid = idTail(c.id)!;
  const row = dbCollectionBySid.get(sid);
  if (!row) {
    collectionsMissing++;
    flag("collection", sid, c.title, "<row>", "exists", "MISSING FROM SUPABASE");
    continue;
  }
  const checks: [string, unknown, unknown][] = [
    ["title", c.title, row.title],
    ["handle", c.handle, row.handle],
    ["description_html", c.descriptionHtml || null, row.description_html],
    ["sort_order", c.sortOrder, row.sort_order],
    ["image_url", c.image?.url ?? null, row.image_url],
  ];
  for (const [field, expected, actual] of checks) {
    if (expected !== actual) flag("collection", sid, c.title, field, expected, actual);
  }

  const expectedProductSids: string[] = c.products.edges.map((e: any) => idTail(e.node.id)!);
  expectedMembershipTotal += expectedProductSids.length;
  const actualLinks = (dbCollectionProductsByCollectionSid.get(sid) ?? []).sort((a, b) => a.position - b.position);
  const actualProductSids = actualLinks.map((l) => l.product_shopify_id);

  const expectedSet = new Set(expectedProductSids);
  const actualSet = new Set(actualProductSids);
  const missingFromDb = expectedProductSids.filter((id) => !actualSet.has(id));
  const extraInDb = actualProductSids.filter((id) => !expectedSet.has(id));
  if (missingFromDb.length > 0) {
    flag("collection_membership", sid, c.title, "missing_products", missingFromDb.length, missingFromDb.slice(0, 10).join(","));
  }
  if (extraInDb.length > 0) {
    flag("collection_membership", sid, c.title, "unexpected_products", extraInDb.length, extraInDb.slice(0, 10).join(","));
  }
  // Order check only when membership sets match exactly (otherwise order diff is noise on top of a real miscount)
  if (missingFromDb.length === 0 && extraInDb.length === 0) {
    for (let i = 0; i < expectedProductSids.length; i++) {
      if (expectedProductSids[i] !== actualProductSids[i]) {
        flag("collection_order", sid, c.title, `position_${i}`, expectedProductSids[i], actualProductSids[i]);
        break; // one flag per collection is enough signal; avoid drowning the report
      }
    }
  }
}

// ---------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------
console.log("\n================ CATALOG VERIFICATION SUMMARY ================");
console.log(`Products checked:      ${products.length} (missing from Supabase: ${productsMissing})`);
console.log(`Variants expected:     ${expectedVariantTotal}`);
console.log(`Images expected:       ${expectedImageTotal} (products hitting the 50-image API page cap: ${productsAt50Images})`);
console.log(`Collections checked:   ${collections.length} (missing from Supabase: ${collectionsMissing})`);
console.log(`Collection memberships expected: ${expectedMembershipTotal}`);
console.log(`\nTotal mismatches found: ${mismatches.length}`);

const byScope = new Map<string, number>();
for (const m of mismatches) byScope.set(m.scope, (byScope.get(m.scope) ?? 0) + 1);
for (const [scope, count] of byScope) console.log(`  - ${scope}: ${count}`);

console.log("\n================ DETAIL (first 200) ================");
for (const m of mismatches.slice(0, 200)) {
  console.log(`[${m.scope}] ${m.shopifyId} (${m.title}) :: ${m.field} :: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
}
if (mismatches.length > 200) console.log(`...and ${mismatches.length - 200} more (see full JSON dump).`);

const fs = await import("node:fs");
fs.writeFileSync("data/exports/catalog-verification-mismatches.json", JSON.stringify(mismatches, null, 2));
console.log("\nFull mismatch list written to data/exports/catalog-verification-mismatches.json");
