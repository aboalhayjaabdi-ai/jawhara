import { mediaUrl } from "@/lib/supabase/media";

/**
 * Same-origin proxy for product-media images, used only by the public Meta/Google product feed
 * (app/feed/products.xml) -- g:image_link points here instead of straight at the Supabase storage
 * domain.
 *
 * Root cause this works around: Meta's own image-fetch crawler, hitting the Supabase storage
 * domain directly, left ~1/3 of the catalog stuck at image_fetch_status "NO_STATUS" indefinitely
 * (confirmed live via the Graph API's image_fetch_status field) even though every one of those
 * same URLs returned 200 with the right content-type for every other client tested, including a
 * burst of 380 concurrent requests with Meta's own crawler UA from this environment. The storage
 * domain sits behind Cloudflare with bot-management active (the __cf_bm cookie is present on every
 * response) and serves every object as `cache-control: private, no-cache` regardless of the
 * cache-control actually stored on the object (confirmed via the storage API's own /object/info
 * endpoint, which reports max-age=31536000 for an object whose real HTTP response came back
 * private/no-cache) -- so nothing is ever cached at Cloudflare's edge and every single fetch,
 * including Meta's retries, re-hits bot-management scoring at the origin. jawhara.se itself has
 * none of this (plain Vercel, no bot-management cookie) and is exactly where Meta's own feed
 * fetcher already successfully pulls the 380-item feed from on a daily schedule with zero errors --
 * routing images through the same domain removes the one hop that was actually unreliable.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Each segment comes from Next's own URL-decoded route matcher, never raw attacker input beyond
  // that -- still reject anything that could escape the product-media bucket (no path traversal,
  // no segment that isn't a plain filename/UUID/numeric-id component).
  if (path.length === 0 || path.some((seg) => seg === "" || seg === "." || seg === "..")) {
    return new Response("Not found", { status: 404 });
  }

  const storagePath = path.map(encodeURIComponent).join("/");
  const upstream = await fetch(mediaUrl(storagePath), {
    // Meta's crawler must always see the current image -- this proxy's own Cache-Control governs
    // downstream caching, not a stale fetch from here.
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  // Real product images are immutable at a given storage path (new uploads get new paths/UUIDs) --
  // safe to cache for a year at both Vercel's edge and any downstream crawler/CDN.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(upstream.body, { status: 200, headers });
}
