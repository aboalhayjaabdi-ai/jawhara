const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLIC_PREFIX = `${BASE}/storage/v1/object/public/product-media/`;

export function mediaUrl(storagePath: string): string {
  return `${PUBLIC_PREFIX}${storagePath}`;
}

// Inverse of mediaUrl -- recovers the bucket-relative storage path from a full public URL, e.g.
// for rebuilding the same image as a same-origin link (see app/img/[...path]/route.ts). Null for
// anything that isn't one of our own product-media URLs.
export function storagePathFromMediaUrl(url: string): string | null {
  return url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : null;
}
