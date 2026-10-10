// Backfills `media` rows for images that are genuinely shared across more than
// one Shopify product. The original 03-products.ts import deduped media rows
// globally by image shopify_id (the old schema only allowed one row per image),
// so every product after the first to reference a shared image lost that
// image entirely. Migration 0002 widened the unique constraint to
// (shopify_id, product_id); this script inserts the previously-dropped rows.
// Idempotent: safe to re-run, only inserts rows that don't already exist.
import { readFileSync, existsSync } from "node:fs";
import { upsert, selectAll } from "../rest.ts";
import { objectExists, uploadFile } from "../storage.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

const products = readJsonl("products");
const manifest = readJsonl<{ productId: string; imageId: string; localPath: string }>("media-manifest");
// Manifest has one entry per (productId, imageId) pair -- key on both so each
// product's own local copy is used (they're byte-identical anyway).
const manifestByKey = new Map(manifest.map((m) => [`${m.productId}:${m.imageId}`, m]));

const productIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);
const existingMediaKeys = new Set(
  (await selectAll<{ shopify_id: string; product_id: string }>("media", "select=shopify_id,product_id")).map(
    (r) => `${r.shopify_id}:${r.product_id}`
  )
);

const newRows: any[] = [];
let uploaded = 0;
let uploadFailed = 0;

async function processImage(p: any, edge: any, position: number) {
  const productShopifyId = idTail(p.id)!;
  const imageShopifyId = idTail(edge.node.id)!;
  const productId = productIdByShopify.get(productShopifyId);
  if (!productId) return;
  if (existingMediaKeys.has(`${imageShopifyId}:${productId}`)) return; // already backed by a row

  const entry = manifestByKey.get(`${productShopifyId}:${imageShopifyId}`);
  if (!entry || !existsSync(entry.localPath)) {
    uploadFailed++;
    console.log(`  ✗ no local file for product ${productShopifyId} image ${imageShopifyId}`);
    return;
  }
  const ext = entry.localPath.split(".").pop();
  const storagePath = `${productShopifyId}/${imageShopifyId}.${ext}`;
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  if (!(await objectExists("product-media", storagePath))) {
    const data = readFileSync(entry.localPath);
    await uploadFile("product-media", storagePath, data, contentType);
  }
  uploaded++;

  newRows.push({
    shopify_id: imageShopifyId,
    product_id: productId,
    storage_path: storagePath,
    alt_text: edge.node.altText || null,
    width: edge.node.width ?? null,
    height: edge.node.height ?? null,
    position,
  });
}

const CONCURRENCY = 3;
const tasks: Array<() => Promise<void>> = [];
for (const p of products) {
  p.images.edges.forEach((edge: any, i: number) => tasks.push(() => processImage(p, edge, i)));
}
for (const batch of chunk(tasks, CONCURRENCY)) {
  await Promise.all(batch.map((t) => t()));
}

for (const batch of chunk(newRows, 100)) {
  await upsert("media", batch, "shopify_id,product_id");
}

console.log(`✓ backfill: ${newRows.length} previously-missing media rows inserted (${uploaded} storage objects confirmed, ${uploadFailed} failed)`);
