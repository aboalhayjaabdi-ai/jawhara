import { supabaseService } from "@/lib/supabase/service-client";
import { generateWebpVariants, variantStoragePath, IMAGE_WIDTH_TIERS } from "@/lib/image-processing";

if (typeof window !== "undefined") {
  throw new Error("lib/supabase/upload-with-variants.ts must never be imported into client code");
}

/** Every real image upload route (product media, collection image, logo, storefront section
 * image) calls this instead of a bare storage.upload() -- it uploads the original UNCHANGED
 * (never resized/re-encoded, never deleted/replaced later) plus a real resized WebP sibling per
 * width tier, all with a far-future cache-control (the originals had none set at all before this,
 * meaning Supabase's CDN wasn't caching them). lib/image-loader.ts (the Next.js custom image
 * loader) rewrites requested widths to these exact sibling paths, so next/image never calls
 * Vercel's Image Optimization endpoint for anything stored here.
 *
 * Variant generation failing (corrupt upload, unsupported format sharp can't decode) must never
 * leave a dangling sibling path the loader assumes exists -- on failure this falls back to
 * uploading the original bytes under the variant paths too, so every path the loader can ever
 * construct for this image is guaranteed to exist and decode as a real image, worst case
 * unresized rather than 404ing. */
export async function uploadImageWithVariants(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ error: string | null }> {
  const { error } = await supabaseService.storage
    .from("product-media")
    .upload(storagePath, buffer, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) return { error: error.message };

  let variants: { path: string; buffer: Buffer; contentType: string }[];
  try {
    variants = (await generateWebpVariants(storagePath, buffer)).map((v) => ({ path: v.path, buffer: v.buffer, contentType: "image/webp" }));
  } catch (e) {
    console.error(`Image variant generation failed for ${storagePath}, falling back to unresized copies:`, e);
    variants = IMAGE_WIDTH_TIERS.map((w) => ({ path: variantStoragePath(storagePath, w), buffer, contentType }));
  }

  await Promise.all(
    variants.map((v) =>
      supabaseService.storage.from("product-media").upload(v.path, v.buffer, { contentType: v.contentType, upsert: true, cacheControl: "31536000" })
    )
  );

  return { error: null };
}
