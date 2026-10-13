// One-time (but safely re-runnable -- every upload uses upsert:true) backfill: generates the
// pre-resized WebP variants (lib/image-processing.ts) for every real image already in Supabase
// Storage, BEFORE the custom image loader (lib/image-loader.ts) is deployed. The loader
// unconditionally rewrites requested widths to these variant paths for every product-media URL,
// so this must run to completion first -- deploying the loader against a catalog with missing
// variants would 404 every product/collection image on the live site.
//
// Also fixes the real, separate "no-cache" issue found on existing uploads (none of the upload
// routes ever set cacheControl before this session) by re-uploading each original under the same
// path with upsert:true + a far-future cacheControl -- same exact bytes, only the served
// Cache-Control header changes. No pixel of any original image is altered.
import { supabaseService } from "@/lib/supabase/service-client";
import { generateWebpVariants, variantStoragePath, IMAGE_WIDTH_TIERS } from "@/lib/image-processing";

const BUCKET = "product-media";
const CONCURRENCY = 3;

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const delay = 500 * 2 ** i;
      console.error(`  retry ${i + 1}/${attempts} for ${label} after ${delay}ms:`, (e as Error).message ?? e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null; // not a Supabase-hosted URL (e.g. a Shopify CDN banner)
  return publicUrl.slice(idx + marker.length);
}

async function processOne(storagePath: string): Promise<"ok" | "error"> {
  try {
    const blob = await withRetry(async () => {
      const { data, error } = await supabaseService.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw new Error(error?.message ?? "empty download");
      return data;
    }, `download ${storagePath}`);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const contentType = blob.type || "image/png";

    // Fix the missing cache-control on the original (same bytes, new header only).
    await withRetry(async () => {
      const { error } = await supabaseService.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
    }, `re-upload original ${storagePath}`);

    let variants;
    try {
      variants = (await generateWebpVariants(storagePath, buffer)).map((v) => ({ path: v.path, buffer: v.buffer, contentType: "image/webp" }));
    } catch (e) {
      console.error(`  variant generation failed for ${storagePath}, falling back to unresized copies:`, e);
      variants = IMAGE_WIDTH_TIERS.map((w) => ({ path: variantStoragePath(storagePath, w), buffer, contentType }));
    }

    for (const v of variants) {
      await withRetry(async () => {
        const { error } = await supabaseService.storage.from(BUCKET).upload(v.path, v.buffer, { contentType: v.contentType, upsert: true, cacheControl: "31536000" });
        if (error) throw new Error(error.message);
      }, `upload variant ${v.path}`);
    }
    return "ok";
  } catch (e) {
    console.error(`  gave up on ${storagePath} after retries:`, (e as Error).message ?? e);
    return "error";
  }
}

async function runBatch(paths: string[]) {
  let ok = 0, error = 0;
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const batch = paths.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processOne));
    ok += results.filter((r) => r === "ok").length;
    error += results.filter((r) => r === "error").length;
    console.log(`  progress: ${Math.min(i + CONCURRENCY, paths.length)}/${paths.length} (ok=${ok}, error=${error})`);
  }
  return { ok, error };
}

async function main() {
  console.log("=== Product media (media.storage_path) ===");
  const { data: mediaRows, error: mediaError } = await supabaseService.from("media").select("storage_path");
  if (mediaError) throw mediaError;
  const mediaPaths = [...new Set((mediaRows ?? []).map((r) => r.storage_path))];
  console.log(`${mediaPaths.length} distinct product image paths`);
  const mediaResult = await runBatch(mediaPaths);

  console.log("\n=== Collection images (collections.image_url) ===");
  const { data: collectionRows, error: collectionError } = await supabaseService.from("collections").select("image_url").not("image_url", "is", null);
  if (collectionError) throw collectionError;
  const collectionPaths = [...new Set((collectionRows ?? []).map((r) => extractStoragePath(r.image_url!)).filter((p): p is string => !!p))];
  console.log(`${collectionPaths.length} distinct collection image paths`);
  const collectionResult = await runBatch(collectionPaths);

  console.log("\n=== Summary ===");
  console.log("Product media:", mediaResult);
  console.log("Collection images:", collectionResult);
  if (mediaResult.error > 0 || collectionResult.error > 0) {
    console.error("\nSome images failed -- DO NOT deploy the new image loader until this is re-run with zero errors.");
    process.exit(1);
  }
  console.log("\nAll variants generated successfully. Safe to deploy the new image loader.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
