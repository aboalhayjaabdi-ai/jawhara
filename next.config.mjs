/** @type {import('next').NextConfig} */
const supabaseHostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co").hostname;

const nextConfig = {
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
