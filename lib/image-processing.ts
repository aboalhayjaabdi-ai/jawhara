import sharp from "sharp";

if (typeof window !== "undefined") {
  throw new Error("lib/image-processing.ts must never be imported into client code");
}

// Fixed width tiers covering every real usage on the site: ~480 for grid/card thumbnails and
// cart/email line items, ~960 for mobile-width galleries and collection tiles, ~1600 for
// desktop product-gallery/hero-width display. Matches the tiers lib/image-loader.ts rewrites
// requested widths to -- the two files must agree on this list.
export const IMAGE_WIDTH_TIERS = [480, 960, 1600] as const;

export function variantStoragePath(originalPath: string, width: number): string {
  return `${originalPath}.w${width}.webp`;
}

export type ImageVariant = { width: number; path: string; buffer: Buffer };

/** Generates real, re-encoded WebP variants at each tier width that doesn't exceed the source
 * image's own intrinsic width (never upscales). Quality 82 is a long-standing safe default for
 * product photography -- visually lossless at normal viewing sizes, meaningfully smaller than
 * the source PNGs/JPEGs this store's images start as. */
export async function generateWebpVariants(originalPath: string, buffer: Buffer): Promise<ImageVariant[]> {
  const metadata = await sharp(buffer).metadata();
  const intrinsicWidth = metadata.width ?? Math.max(...IMAGE_WIDTH_TIERS);

  const variants: ImageVariant[] = [];
  for (const width of IMAGE_WIDTH_TIERS) {
    const targetWidth = Math.min(width, intrinsicWidth);
    const resized = await sharp(buffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    variants.push({ width, path: variantStoragePath(originalPath, width), buffer: resized });
  }
  return variants;
}
