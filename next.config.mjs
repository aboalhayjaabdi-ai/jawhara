/** @type {import('next').NextConfig} */
const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co").hostname;

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
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Collection images (collections.image_url) still point at Shopify's CDN --
        // product images are re-hosted in Supabase Storage, but collection banner
        // images were not re-hosted during migration (see docs/migration-verification.md).
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
    ],
  },
};

export default nextConfig;
