// Re-hosts the real collection subcategory-tile images that are still hotlinked directly to
// Shopify's CDN (collections.image_url), into Supabase Storage -- same independence requirement
// already applied to every product image during Phase 3. Only touches the 13 collections whose
// image_url is a genuine cdn.shopify.com URL; leaves every other collection's image_url untouched.
import { ensureBucket, uploadFile, publicUrl } from "./storage.ts";
import { runSql } from "./db.ts";

await ensureBucket("product-media", true);

const rows: any = await runSql(`select handle, image_url from collections where image_url like '%cdn.shopify.com%'`);

console.log(`Found ${rows.length} collections with a Shopify-CDN image_url to re-host.`);

for (const row of rows) {
  const { handle, image_url } = row;
  const res = await fetch(image_url);
  if (!res.ok) {
    console.error(`  ✗ ${handle}: failed to fetch ${image_url} (${res.status})`);
    continue;
  }
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";
  const buffer = Buffer.from(await res.arrayBuffer());
  const path = `collections/${handle}.${ext}`;

  await uploadFile("product-media", path, buffer, contentType);
  const newUrl = publicUrl("product-media", path);
  await runSql(`update collections set image_url = '${newUrl}' where handle = '${handle}'`);
  console.log(`  ✓ ${handle} -> ${path}`);
}

console.log("\nDone.");
