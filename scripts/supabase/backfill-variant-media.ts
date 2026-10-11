// Links `media` rows to the specific `product_variants` row they belong to, wherever Shopify's
// own export already captured that link (variant.image), and -- only where the data shows it's
// needed -- moves images that match no variant to right after the product's first image.
//
// Root cause this closes: `media.variant_id` has existed in the schema since the initial
// migration but was never populated. Only 7 of 376 products have any variant.image data at all
// (h-armband, presentbox, and the 5 "noelle-vaska-mini" duplicate listings) -- this script is
// catalog-wide/generic, not Noelle-specific code, but in practice only touches those 7 products
// because that's the only place the real Shopify data has this link.
//
// Idempotent: safe to re-run. Re-running after it has already run computes the same variant_id
// and position values and issues no-op updates.
import { runSql } from "./db.ts";
import { selectAll } from "./rest.ts";
import { readJsonl, idTail } from "./import/util.ts";

type ProductNode = {
  id: string;
  handle: string;
  images: { edges: { node: { id: string } }[] };
  variants: { edges: { node: { id: string; image?: { id: string } | null } }[] };
};

const products = readJsonl<ProductNode>("products");

const productIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);
const variantIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("product_variants", "select=id,shopify_id")).map((r) => [
    r.shopify_id,
    r.id,
  ])
);
// media.shopify_id is not globally unique (shared images have one row per product), so key on
// both -- same convention as scripts/supabase/import/09-backfill-shared-media.ts.
const mediaIdByKey = new Map(
  (await selectAll<{ id: string; shopify_id: string; product_id: string }>("media", "select=id,shopify_id,product_id")).map(
    (r) => [`${r.shopify_id}:${r.product_id}`, r.id]
  )
);

const variantLinkUpdates: { mediaId: string; variantId: string }[] = [];
const positionUpdates: { mediaId: string; position: number }[] = [];

for (const p of products) {
  const productId = productIdByShopify.get(idTail(p.id)!);
  if (!productId) continue;

  const images = p.images.edges.map((e) => e.node);
  const variants = p.variants.edges.map((e) => e.node);
  const variantImageIds = new Map<string, string>(); // imageShopifyId -> variantShopifyId
  for (const v of variants) {
    if (v.image) variantImageIds.set(idTail(v.image.id)!, idTail(v.id)!);
  }
  if (variantImageIds.size === 0) continue;

  // Step 1: link each media row to the variant whose real Shopify image it is.
  const linkedFlags: boolean[] = [];
  for (const img of images) {
    const imageShopifyId = idTail(img.id)!;
    const mediaId = mediaIdByKey.get(`${imageShopifyId}:${productId}`);
    const variantShopifyId = variantImageIds.get(imageShopifyId);
    const linked = !!variantShopifyId;
    linkedFlags.push(linked);
    if (mediaId && variantShopifyId) {
      const variantId = variantIdByShopify.get(variantShopifyId);
      if (variantId) variantLinkUpdates.push({ mediaId, variantId });
    }
  }

  // Step 2: only when the product has a genuine mix of variant-linked and unlinked images (e.g.
  // Noelle's 3 trailing lifestyle photos) -- move the unlinked images to right after position 0,
  // preserving their own and the linked images' relative order. A no-op when already in that
  // shape (one of the 5 Noelle duplicates already is), and never triggered for the other 369
  // products, which have no unlinked images at all.
  const anyLinked = linkedFlags.some(Boolean);
  const anyUnlinked = linkedFlags.some((f) => !f);
  if (!anyLinked || !anyUnlinked) continue;

  const unlinkedIdx = linkedFlags.map((f, i) => i).filter((i) => i !== 0 && !linkedFlags[i]);
  const linkedIdxExcl0 = linkedFlags.map((f, i) => i).filter((i) => i !== 0 && linkedFlags[i]);
  const newOrder = [0, ...unlinkedIdx, ...linkedIdxExcl0]; // old index at each new position

  newOrder.forEach((oldIndex, newPosition) => {
    if (oldIndex === newPosition) return; // already correct
    const imageShopifyId = idTail(images[oldIndex].id)!;
    const mediaId = mediaIdByKey.get(`${imageShopifyId}:${productId}`);
    if (mediaId) positionUpdates.push({ mediaId, position: newPosition });
  });
}

async function bulkUpdate(table: string, column: string, type: string, rows: { mediaId: string; value: string | number }[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => `('${r.mediaId}'::uuid, ${typeof r.value === "number" ? r.value : `'${r.value}'::uuid`})`).join(",\n    ");
  await runSql(`
    UPDATE ${table} m
    SET ${column} = v.value${type ? `::${type}` : ""}
    FROM (VALUES
    ${values}
    ) AS v(media_id, value)
    WHERE m.id = v.media_id;
  `);
}

await bulkUpdate(
  "media",
  "variant_id",
  "uuid",
  variantLinkUpdates.map((u) => ({ mediaId: u.mediaId, value: u.variantId }))
);
await bulkUpdate(
  "media",
  "position",
  "int",
  positionUpdates.map((u) => ({ mediaId: u.mediaId, value: u.position }))
);

console.log(`✓ variant_id linked on ${variantLinkUpdates.length} media rows`);
console.log(`✓ position reordered on ${positionUpdates.length} media rows`);
