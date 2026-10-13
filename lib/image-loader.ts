// Custom Next.js image loader (next.config.mjs: images.loader = "custom", images.loaderFile =
// this file). Once set, next/image NEVER calls Vercel's Image Optimization endpoint
// (/_next/image) for any <Image> on the site, admin included -- this function alone decides the
// final <img src>/<source srcset> URL for every width Next's responsive markup requests. That is
// the actual fix for the Vercel Hobby plan's 5,000/month Image Optimization transformation limit:
// zero further transformations are ever requested, regardless of traffic.
//
// Real product/collection/logo/storefront images already have pre-generated WebP siblings at
// IMAGE_WIDTH_TIERS widths (lib/image-processing.ts, uploaded by lib/supabase/upload-with-
// variants.ts, backfilled for pre-existing images by scripts/supabase/backfill-image-variants.ts)
// -- this picks the smallest tier that still covers the requested width, so real, smaller files
// are served responsively without any on-the-fly transformation service. Shopify's CDN (the
// handful of not-yet-rehosted collection banners) has its own free, native resize-by-URL feature,
// used instead. The homepage hero/comparison-slider images under /brand/ have the same
// pre-generated width-tiered siblings (generated once at build time, committed as static files --
// still zero Vercel transformations), so they're served at a viewport-appropriate size instead of
// always shipping the full desktop/mobile master file. Any other local /public file or unknown
// host passes through unchanged.

const WIDTH_TIERS = [480, 960, 1600] as const;

function nearestTier(width: number): number {
  for (const tier of WIDTH_TIERS) {
    if (width <= tier) return tier;
  }
  return WIDTH_TIERS[WIDTH_TIERS.length - 1];
}

export default function jawharaImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (src.includes("/storage/v1/object/public/product-media/") && !/\.w\d+\.webp$/.test(src)) {
    return `${src}.w${nearestTier(width)}.webp`;
  }
  if (src.startsWith("/brand/") && src.endsWith(".webp") && !/\.w\d+\.webp$/.test(src)) {
    return `${src}.w${nearestTier(width)}.webp`;
  }
  if (src.includes("cdn.shopify.com")) {
    const tier = nearestTier(width);
    return src.includes("?") ? `${src}&width=${tier}` : `${src}?width=${tier}`;
  }
  return src;
}
