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

// Real Shopify sort options this theme actually exposes (snippets/sorting.liquid), minus
// "best-selling" -- no sales-count/popularity data exists anywhere in this schema, so that one
// option is not offered rather than faked with a different ordering.
export type CollectionSort = "manual" | "price-asc" | "price-desc" | "title-asc" | "title-desc" | "created-desc" | "created-asc";

export type CollectionFilterOptions = {
  sort?: CollectionSort;
  inStockOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
};

function hasActiveFilter(options: CollectionFilterOptions): boolean {
  return (!!options.sort && options.sort !== "manual") || !!options.inStockOnly || options.minPrice != null || options.maxPrice != null;
}

type RawProductRow = {
  title: string;
  handle: string;
  status?: string;
  created_at?: string;
  media: { storage_path: string; position: number }[];
  product_variants: { id?: string; sku?: string | null; price: number; compare_at_price: number | null; inventory_quantity?: number; inventory_tracked?: boolean; inventory_policy?: string | null }[];
};

// Collection sizes in this catalog top out at a couple hundred products, so sorting/filtering by
// price or availability (neither of which lives directly on `products`, and neither of which
// Postgres/PostgREST can cheaply order a parent by without a view) is done in application code
// against the full active product set for that collection/catalog, rather than adding a schema
// migration for what isn't a real-scale problem here. The default "manual" path with no filters
// never takes this route -- see getCollectionProductCards/getAllProductCards above, untouched.
function sortFilterPaginate(rows: RawProductRow[], options: CollectionFilterOptions, limit: number, offset: number): { cards: ProductCard[]; total: number } {
  let withMeta = rows.map((p) => {
    const variant = p.product_variants.length ? cheapestVariant(p.product_variants) : null;
    const available = p.product_variants.some((v) =>
      isVariantAvailable(
        { productStatus: p.status ?? "active", inventoryTracked: v.inventory_tracked ?? false, inventoryPolicy: v.inventory_policy ?? null, inventoryQuantity: v.inventory_quantity ?? 0 },
        1
      )
    );
    return { p, price: variant?.price ?? 0, available };
  });

  if (options.inStockOnly) withMeta = withMeta.filter((x) => x.available);
  if (options.minPrice != null) withMeta = withMeta.filter((x) => x.price >= options.minPrice!);
  if (options.maxPrice != null) withMeta = withMeta.filter((x) => x.price <= options.maxPrice!);

  switch (options.sort) {
    case "price-asc":
      withMeta.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      withMeta.sort((a, b) => b.price - a.price);
      break;
    case "title-asc":
      withMeta.sort((a, b) => a.p.title.localeCompare(b.p.title, "sv"));
      break;
    case "title-desc":
      withMeta.sort((a, b) => b.p.title.localeCompare(a.p.title, "sv"));
      break;
    case "created-desc":
      withMeta.sort((a, b) => new Date(b.p.created_at ?? 0).getTime() - new Date(a.p.created_at ?? 0).getTime());
      break;
    case "created-asc":
      withMeta.sort((a, b) => new Date(a.p.created_at ?? 0).getTime() - new Date(b.p.created_at ?? 0).getTime());
      break;
    default:
      break; // "manual": keep the real Shopify position order rows already arrived in
  }

  const total = withMeta.length;
  const cards = withMeta.slice(offset, offset + limit).map((x) => toCard(x.p));
  return { cards, total };
}

/** Collection products with sort/filter applied -- only used when the user actively picks a non-default sort or a filter; the plain paginated path above is untouched otherwise. */
export async function getFilteredCollectionProducts(
  handle: string,
  options: CollectionFilterOptions,
  limit: number,
  offset = 0
): Promise<{ cards: ProductCard[]; total: number }> {
  const { data: collection } = await supabase.from("collections").select("id").eq("handle", handle).single();
  if (!collection) return { cards: [], total: 0 };

  const { data } = await supabase
    .from("collection_products")
    .select(
      "products!inner(title, handle, status, created_at, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy))"
    )
    .eq("collection_id", collection.id)
    .eq("products.status", "active");

  const rows = ((data ?? []) as any[]).map((r) => r.products as RawProductRow);
  return sortFilterPaginate(rows, options, limit, offset);
}

/** Same as getFilteredCollectionProducts, for /collections/all. */
export async function getFilteredAllProducts(options: CollectionFilterOptions, limit: number, offset = 0): Promise<{ cards: ProductCard[]; total: number }> {
  const { data } = await supabase
    .from("products")
    .select("title, handle, status, created_at, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy)")
    .eq("status", "active");

  return sortFilterPaginate((data ?? []) as RawProductRow[], options, limit, offset);
}

export { hasActiveFilter };

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

// Real Shopify used its own ML-based recommendation engine (routes.product_recommendations_url),
// which can't be reproduced post-migration -- this is the approved collection-based fallback.
// Non-navigational utility/feed collections, confirmed never linked from any menu.
const UTILITY_COLLECTION_HANDLES = new Set(["bastsaljare", "bastsaljare-1", "nyheter", "noelle-mini-vaskor", "ads-1", "meta", "meta-vaskor"]);

function isRealCategoryHandle(handle: string): boolean {
  return !UTILITY_COLLECTION_HANDLES.has(handle) && !handle.endsWith("-copy");
}

/**
 * Related products for a PDP, preferring the most specific shared real category (e.g. a gold
 * bracelet recommends other gold bracelets before falling back to bracelets-in-general). "Most
 * specific" = the real category collection the product belongs to with the fewest active products.
 */
export async function getRelatedProductCards(productId: string, excludeHandle: string, limit = 4): Promise<ProductCard[]> {
  const { data: memberships } = await supabase
    .from("collection_products")
    .select("collections!inner(id, handle)")
    .eq("product_id", productId);

  const candidates = ((memberships ?? []) as any[])
    .map((r) => r.collections as { id: string; handle: string })
    .filter((c) => isRealCategoryHandle(c.handle));

  if (candidates.length === 0) return [];

  const withCounts = await Promise.all(
    candidates.map(async (c) => {
      const { count } = await supabase
        .from("collection_products")
        .select("product_id, products!inner(status)", { count: "exact", head: true })
        .eq("collection_id", c.id)
        .eq("products.status", "active");
      return { ...c, count: count ?? 0 };
    })
  );
  withCounts.sort((a, b) => a.count - b.count);

  const picked: any[] = [];
  const seenHandles = new Set([excludeHandle]);

  for (const collection of withCounts) {
    if (picked.length >= limit) break;
    const { data } = await supabase
      .from("collection_products")
      .select(
        "position, products!inner(title, handle, status, media(storage_path, position), product_variants(id, sku, price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy))"
      )
      .eq("collection_id", collection.id)
      .eq("products.status", "active")
      .order("position", { ascending: true })
      .limit(limit * 2);

    for (const row of (data ?? []) as any[]) {
      const p = row.products;
      if (seenHandles.has(p.handle)) continue;
      seenHandles.add(p.handle);
      picked.push(p);
      if (picked.length >= limit) break;
    }
  }

  const cards = picked.map(toCard);
  // Prefer purchasable products -- a stable sort keeps the collection's own relative ordering
  // within each availability group.
  cards.sort((a, b) => Number(b.available) - Number(a.available));
  return cards.slice(0, limit);
}
