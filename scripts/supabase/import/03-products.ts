import { readFileSync, existsSync } from "node:fs";
import { upsert, selectAll } from "../rest.ts";
import { uploadFile } from "../storage.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

const products = readJsonl("products");
const manifest = readJsonl<{ productId: string; imageId: string; localPath: string }>("media-manifest");
const manifestByImageId = new Map(manifest.map((m) => [m.imageId, m]));

// --- 1. Products (core fields) ---
const productRows = products.map((p: any) => ({
  shopify_id: idTail(p.id),
  title: p.title,
  handle: p.handle,
  status: (p.status || "ACTIVE").toLowerCase(),
  product_type: p.productType || null,
  vendor: p.vendor || null,
  description_html: p.descriptionHtml || null,
  tags: p.tags || [],
  seo_title: p.seo?.title ?? null,
  seo_description: p.seo?.description ?? null,
  published_at: p.publishedAt || null,
}));

await Promise.all(chunk(productRows, 50).map((batch) => upsert("products", batch, "shopify_id")));
console.log(`✓ products: ${productRows.length} upserted`);

const productIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

// --- 2. Variants ---
const variantRows: any[] = [];
for (const p of products) {
  const productId = productIdByShopify.get(idTail(p.id)!);
  for (const edge of p.variants.edges) {
    const v = edge.node;
    variantRows.push({
      shopify_id: idTail(v.id),
      product_id: productId,
      title: v.title,
      sku: v.sku || null,
      barcode: v.barcode || null,
      price: Number(v.price),
      compare_at_price: v.compareAtPrice ? Number(v.compareAtPrice) : null,
      inventory_quantity: v.inventoryQuantity ?? 0,
      inventory_policy: v.inventoryPolicy || null,
      taxable: v.taxable ?? true,
      option1: v.selectedOptions?.[0]?.value ?? null,
      option2: v.selectedOptions?.[1]?.value ?? null,
      option3: v.selectedOptions?.[2]?.value ?? null,
    });
  }
}
for (const batch of chunk(variantRows, 100)) {
  await upsert("product_variants", batch, "shopify_id");
}
console.log(`✓ product_variants: ${variantRows.length} upserted`);

// --- 3. Media: upload images to Storage, then insert media rows ---
let uploaded = 0;
let uploadFailed = 0;
const mediaRows: any[] = [];

async function processImage(p: any, edge: any, position: number) {
  const productShopifyId = idTail(p.id)!;
  const imageShopifyId = idTail(edge.node.id)!;
  const entry = manifestByImageId.get(imageShopifyId);
  if (!entry || !existsSync(entry.localPath)) {
    uploadFailed++;
    return;
  }
  const ext = entry.localPath.split(".").pop();
  const storagePath = `${productShopifyId}/${imageShopifyId}.${ext}`;
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const data = readFileSync(entry.localPath);

  await uploadFile("product-media", storagePath, data, contentType);
  uploaded++;

  mediaRows.push({
    shopify_id: imageShopifyId,
    product_id: productIdByShopify.get(productShopifyId),
    storage_path: storagePath,
    alt_text: edge.node.altText || null,
    width: edge.node.width ?? null,
    height: edge.node.height ?? null,
    position,
  });
}

// Limited concurrency to avoid hammering the Storage API.
const CONCURRENCY = 8;
const tasks: Array<() => Promise<void>> = [];
for (const p of products) {
  p.images.edges.forEach((edge: any, i: number) => tasks.push(() => processImage(p, edge, i)));
}
for (const batch of chunk(tasks, CONCURRENCY)) {
  await Promise.all(batch.map((t) => t()));
  if ((uploaded + uploadFailed) % 80 < CONCURRENCY) console.log(`  ...${uploaded + uploadFailed}/${tasks.length} images processed`);
}

for (const batch of chunk(mediaRows, 100)) {
  await upsert("media", batch, "shopify_id");
}
console.log(`✓ media: ${uploaded} uploaded, ${uploadFailed} failed, ${mediaRows.length} rows inserted`);

// --- 4. Reviews (Judge.me metafield data; Pennywise metafields are never read here) ---
const reviewRows: any[] = [];
for (const p of products) {
  const productId = productIdByShopify.get(idTail(p.id)!);
  const widget = p.metafields.edges.find((e: any) => e.node.namespace === "judgeme" && e.node.key === "review_widget_data");
  if (!widget) continue;
  try {
    const parsed = JSON.parse(widget.node.value);
    for (const r of parsed.reviews ?? []) {
      reviewRows.push({
        source_review_id: r.uuid,
        product_id: productId,
        rating: r.rating,
        author_name: r.is_anonymous_reviewer ? "Anonym" : r.reviewer_name,
        body: r.body,
        verified_buyer: !!r.verified_buyer,
        created_at: r.created_at,
      });
    }
  } catch {
    // malformed metafield JSON — skip this product's reviews, already flagged in verify.ts if relevant
  }
}
for (const batch of chunk(reviewRows, 100)) {
  await upsert("reviews", batch, "source_review_id");
}
console.log(`✓ reviews: ${reviewRows.length} upserted`);
