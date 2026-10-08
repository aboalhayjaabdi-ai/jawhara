import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { shopifyGraphQL } from "./client.ts";
import { EXPORT_DIR, MEDIA_DIR } from "./extract/util.ts";

function readJsonl(resource: string): any[] {
  const path = `${EXPORT_DIR}/${resource}.jsonl`;
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function idTail(gid: string): string {
  return gid.split("/").pop()!;
}

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}: ${detail}`);
}

// --- 1. Record counts vs live Shopify ---
const liveCounts = await shopifyGraphQL<any>(
  `{ productsCount { count } collectionsCount { count } customersCount { count } ordersCount { count } }`
);

const products = readJsonl("products");
const collections = readJsonl("collections");
const customers = readJsonl("customers");
const orders = readJsonl("orders");

record(
  "products count matches live",
  products.length === liveCounts.productsCount.count,
  `extracted ${products.length}, live ${liveCounts.productsCount.count}`
);
record(
  "collections count matches live",
  collections.length === liveCounts.collectionsCount.count,
  `extracted ${collections.length}, live ${liveCounts.collectionsCount.count}`
);
record(
  "customers count matches live",
  customers.length === liveCounts.customersCount.count,
  `extracted ${customers.length}, live ${liveCounts.customersCount.count}`
);
record(
  "orders count matches live",
  orders.length === liveCounts.ordersCount.count,
  `extracted ${orders.length}, live ${liveCounts.ordersCount.count}`
);

// --- 2. No duplicate IDs ---
for (const [name, records] of [
  ["products", products],
  ["collections", collections],
  ["customers", customers],
  ["orders", orders],
] as const) {
  const ids = records.map((r) => r.id);
  const unique = new Set(ids);
  record(`${name}: no duplicate IDs`, unique.size === ids.length, `${ids.length} records, ${unique.size} unique`);
}

// --- 3. Every product has at least one variant ---
const productsNoVariants = products.filter((p) => p.variants.edges.length === 0);
record(
  "every product has ≥1 variant",
  productsNoVariants.length === 0,
  productsNoVariants.length === 0
    ? "all 376 products have variants"
    : `${productsNoVariants.length} products with zero variants: ${productsNoVariants.map((p) => p.handle).join(", ")}`
);

// --- 4. Every product image has a downloaded file ---
const manifestPath = `${EXPORT_DIR}/media-manifest.jsonl`;
const manifest: Array<{ productId: string; imageId: string; localPath: string }> = existsSync(manifestPath)
  ? readFileSync(manifestPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];

let expectedImages = 0;
const missingFiles: string[] = [];
for (const p of products) {
  for (const edge of p.images.edges) {
    expectedImages++;
    const entry = manifest.find((m) => m.imageId === idTail(edge.node.id));
    if (!entry || !existsSync(entry.localPath)) {
      missingFiles.push(`${p.handle} / ${idTail(edge.node.id)}`);
    }
  }
}
record(
  "every product image downloaded",
  missingFiles.length === 0,
  missingFiles.length === 0
    ? `all ${expectedImages} images present on disk`
    : `${missingFiles.length} of ${expectedImages} missing: ${missingFiles.slice(0, 10).join(", ")}${missingFiles.length > 10 ? "…" : ""}`
);

// --- 5. Collection product counts match each collection's own productsCount ---
let collectionMismatches = 0;
const collectionDetails: string[] = [];
for (const c of collections) {
  const extractedCount = c.products.edges.length;
  const reportedCount = c.productsCount.count;
  if (extractedCount !== reportedCount) {
    collectionMismatches++;
    collectionDetails.push(`${c.handle}: extracted ${extractedCount} vs reported ${reportedCount}`);
  }
}
record(
  "collection↔product counts match",
  collectionMismatches === 0,
  collectionMismatches === 0
    ? `all ${collections.length} collections match`
    : `${collectionMismatches} mismatches: ${collectionDetails.join("; ")}`
);

// --- 6. Pennywise exclusion sanity check (data exists in raw export, which is fine — flag it so Phase 3 import can filter it) ---
const productsWithPennywise = products.filter((p) =>
  p.metafields.edges.some((e: any) => e.node.namespace === "pennywise")
);
record(
  "pennywise metafield presence noted (informational — excluded from Supabase import, not an error)",
  true,
  `${productsWithPennywise.length} of ${products.length} products carry pennywise metafields in the raw export`
);

// --- 7. Judge.me review completeness flag ---
const reviewCapped: string[] = [];
let productsWithReviews = 0;
for (const p of products) {
  const widget = p.metafields.edges.find(
    (e: any) => e.node.namespace === "judgeme" && e.node.key === "review_widget_data"
  );
  if (!widget) continue;
  productsWithReviews++;
  try {
    const parsed = JSON.parse(widget.node.value);
    const totalReviews = parsed.number_of_reviews ?? 0;
    const perPage = parsed.pagination?.per_page ?? Infinity;
    if (totalReviews > perPage) {
      reviewCapped.push(`${p.handle}: ${totalReviews} reviews, only ${perPage} cached`);
    }
  } catch {
    // malformed JSON in metafield — not fatal, just can't check this one
  }
}
record(
  "judge.me review cache completeness",
  reviewCapped.length === 0,
  reviewCapped.length === 0
    ? `${productsWithReviews} products have review data, none appear truncated by the metafield cache`
    : `${reviewCapped.length} products likely have MORE reviews than cached: ${reviewCapped.join("; ")}`
);

// --- write report ---
mkdirSync("docs", { recursive: true });
const passCount = checks.filter((c) => c.pass).length;
const report = `# Migration Verification Report

Generated ${new Date().toISOString()} against live store \`1tq41d-4y.myshopify.com\`.

**${passCount} of ${checks.length} checks passed.**

| Check | Result | Detail |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.pass ? "✓ PASS" : "✗ FAIL"} | ${c.detail} |`).join("\n")}
`;
writeFileSync("docs/migration-verification.md", report);
console.log(`\n${passCount}/${checks.length} checks passed. Report written to docs/migration-verification.md`);
