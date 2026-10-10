const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function mediaUrl(storagePath: string): string {
  return `${BASE}/storage/v1/object/public/product-media/${storagePath}`;
}
