/** @type {import('next').NextConfig} */
const nextConfig = {
  // middleware.ts needs the Node.js runtime (not the default Edge runtime) because it imports
  // undici to route through this environment's required outbound proxy -- Edge Runtime's fetch
  // can't be proxied that way at all, and can't bundle Node built-ins like node:dns either.
  experimental: {
    nodeMiddleware: true,
  },
  async redirects() {
    return [
      // Old Shopify URL preservation. Product/collection/page paths already match
      // Shopify's own URL scheme exactly (no redirect needed, see
      // docs/migration-verification.md). This one real exception: the ParcelPanel
      // order-tracking app isn't migrated yet (later-phase work), so its old URL
      // would otherwise 404 -- send it to Contact in the meantime.
      { source: "/apps/parcelpanel", destination: "/pages/contact", permanent: false },
    ];
  },
  images: {
    // A custom loader (lib/image-loader.ts) means next/image never calls Vercel's own Image
    // Optimization endpoint at all -- this is what keeps the Hobby plan's 5,000/month
    // transformation limit from ever being hit again, regardless of traffic. remotePatterns/
    // minimumCacheTTL only apply to Next's built-in optimizer, so they're unused (and unneeded)
    // once a custom loader is set; real caching now happens via the far-future Cache-Control the
    // images themselves are uploaded with (lib/supabase/upload-with-variants.ts) and Shopify's
    // own CDN for the handful of not-yet-rehosted collection banners.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
};

export default nextConfig;
