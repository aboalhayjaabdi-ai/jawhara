import { supabase } from "./supabase/client";
import { mediaUrl } from "./supabase/media";
import { isVariantAvailable } from "./inventory";

export type ProductCard = {
  title: string;
  handle: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  available: boolean;
  // Quick-add only ever targets a product's single variant from the grid -- a product with
  // real size/option variants still requires visiting the PDP to choose, same as the original
  // theme's quick-add modal did for multi-option products.
  quickAddVariantId: string | null;
};

function cheapestVariant<T extends { price: number }>(variants: T[]) {
  return variants.reduce((min, v) => (v.price < min.price ? v : min), variants[0]);
}

function toCard(p: {
  title: string;
  handle: string;
  status?: string;
  media: { storage_path: string; position: number }[];
  product_variants: {
    id?: string;
    sku?: string | null;
    price: number;
    compare_at_price: number | null;
    inventory_quantity?: number;
    inventory_tracked?: boolean;
    inventory_policy?: string | null;
  }[];
}): ProductCard {
  const sorted = [...p.media].sort((a, b) => a.position - b.position);
  const variant = p.product_variants.length ? cheapestVariant(p.product_variants) : null;
  // Shows the selected/cheapest variant's own SKU, or the first variant's if that's blank --
  // never a different product's SKU, never invented when none exists.
  const sku = variant?.sku ?? p.product_variants[0]?.sku ?? null;
  const available = p.product_variants.some((v) =>
    isVariantAvailable(
      {
        productStatus: p.status ?? "active",
        inventoryTracked: v.inventory_tracked ?? false,
        inventoryPolicy: v.inventory_policy ?? null,
        inventoryQuantity: v.inventory_quantity ?? 0,
      },
      1
    )
  );
  return {
    title: p.title,
    handle: p.handle,
    image: sorted[0] ? mediaUrl(sorted[0].storage_path) : null,
    price: variant?.price ?? 0,
    compareAtPrice: variant?.compare_at_price ?? null,
    sku,
    available,
    quickAddVariantId: p.product_variants.length === 1 ? p.product_variants[0].id ?? null : null,
  };
}

/** Product cards for a collection, by its real Shopify handle, ordered by the real position Shopify stores. */
export async function getCollectionProductCards(handle: string, limit: number, offset = 0): Promise<ProductCard[]> {
  const { data: collection } = await supabase.from("collections").select("id").eq("handle", handle).single();
  if (!collection) return [];

  const { data } = await supabase
    .from("collection_products")
    .select(
      "position, products!inner(title, handle, status, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy))"
    )
    .eq("collection_id", collection.id)
    .eq("products.status", "active")
    .order("position", { ascending: true })
    .range(offset, offset + limit - 1);

  return (data ?? []).map((row: any) => toCard(row.products));
}

/** For /collections/all -- Shopify's built-in catalog-wide route; no backing `collections` row exists for it. */
export async function getAllProductCards(limit: number, offset = 0): Promise<{ cards: ProductCard[]; total: number }> {
  const { data, count } = await supabase
    .from("products")
    .select(
      "title, handle, status, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy)",
      { count: "exact" }
    )
    .eq("status", "active")
    .order("title", { ascending: true })
    .range(offset, offset + limit - 1);

  return { cards: (data ?? []).map(toCard), total: count ?? 0 };
}

export async function getCollectionsByHandles(handles: string[]) {
  const { data } = await supabase.from("collections").select("title, handle, image_url").in("handle", handles);
  const byHandle = new Map((data ?? []).map((c) => [c.handle, c]));
  // preserve the caller's order (the real theme's configured collection_list order)
  return handles.map((h) => byHandle.get(h)).filter(Boolean) as { title: string; handle: string; image_url: string | null }[];
}

export async function getCollectionMeta(handle: string) {
  const { data } = await supabase
    .from("collections")
    .select("title, handle, description_html, image_url, seo_title, seo_description, template_suffix")
    .eq("handle", handle)
    .single();
  return data;
}

export async function getCollectionProductCount(handle: string): Promise<number> {
  const { data: collection } = await supabase.from("collections").select("id").eq("handle", handle).single();
  if (!collection) return 0;
  const { count } = await supabase
    .from("collection_products")
    .select("product_id", { count: "exact", head: true })
    .eq("collection_id", collection.id);
  return count ?? 0;
}

export async function getFeaturedProduct(handle: string) {
  return getProductByHandle(handle);
}

export async function getProductByHandle(handle: string) {
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, title, handle, description_html, vendor, tags, seo_title, seo_description, status, template_suffix, media(shopify_id, storage_path, position, alt_text), product_variants(id, title, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy)"
    )
    .eq("handle", handle)
    .single();
  if (!product) return null;

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating, author_name, body, verified_buyer, created_at")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  const images = [...product.media].sort((a, b) => a.position - b.position).map((m) => mediaUrl(m.storage_path));
  const variants = [...product.product_variants];
  const options = Array.from(new Set(variants.map((v) => v.option1).filter(Boolean))) as string[];

  return { ...product, images, variants, sizeOptions: options, reviews: reviews ?? [] };
}

export async function searchProductCards(query: string, limit = 24): Promise<ProductCard[]> {
  if (!query.trim()) return [];
  const { data } = await supabase
    .from("products")
    .select(
      "title, handle, status, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy)"
    )
    .eq("status", "active")
    .ilike("title", `%${query}%`)
    .limit(limit);
  return (data ?? []).map(toCard);
}

export async function getRelatedProducts(excludeHandle: string, limit = 4): Promise<ProductCard[]> {
  const { data } = await supabase
    .from("products")
    .select(
      "title, handle, status, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy)"
    )
    .eq("status", "active")
    .neq("handle", excludeHandle)
    .limit(limit);
  return (data ?? []).map(toCard);
}
