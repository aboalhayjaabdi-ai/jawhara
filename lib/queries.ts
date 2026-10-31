import { cache } from "react";
import { supabase } from "./supabase/client";
import { mediaUrl } from "./supabase/media";
import { isVariantAvailable } from "./inventory";

export type ProductCardVariant = {
  id: string;
  price: number;
  compareAtPrice: number | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  available: boolean;
  // The real per-variant image (Shopify's own variant.image), when one is linked -- null when no
  // such link exists, in which case callers fall back to the card's own representative `image`.
  // Never invented -- same `media.variant_id` link already used by the PDP gallery.
  image: string | null;
};

export type ProductCard = {
  // Meta/Google feed's g:id (see getProductFeedItems) is this same products.id -- carried through
  // every card so add-to-cart/view-content tracking can send a content_id that actually matches a
  // real catalog item, instead of a variant id the catalog has no entry for.
  id: string;
  title: string;
  handle: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  available: boolean;
  // Set only for a single-variant product -- quick-add can add it directly. A product with real
  // size/color options instead offers a variant picker (see `variants` below) before adding.
  quickAddVariantId: string | null;
  variants: ProductCardVariant[];
};

function cheapestVariant<T extends { price: number }>(variants: T[]) {
  return variants.reduce((min, v) => (v.price < min.price ? v : min), variants[0]);
}

function toCard(p: {
  id: string;
  title: string;
  handle: string;
  status?: string;
  media: { storage_path: string; position: number; variant_id?: string | null }[];
  product_variants: {
    id?: string;
    sku?: string | null;
    price: number;
    compare_at_price: number | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    inventory_quantity?: number;
    inventory_tracked?: boolean;
    inventory_policy?: string | null;
  }[];
}): ProductCard {
  const sorted = [...p.media].sort((a, b) => a.position - b.position);
  const variant = p.product_variants.length ? cheapestVariant(p.product_variants) : null;
  // Real per-variant image links, same mechanism as getProductByHandle's variantImageIndex --
  // first media row linked to each variant_id, in position order.
  const imageByVariantId: Record<string, string> = {};
  for (const m of sorted) {
    if (m.variant_id && !imageByVariantId[m.variant_id]) imageByVariantId[m.variant_id] = mediaUrl(m.storage_path);
  }
  // Shows the selected/cheapest variant's own SKU, or the first variant's if that's blank --
  // never a different product's SKU, never invented when none exists.
  const sku = variant?.sku ?? p.product_variants[0]?.sku ?? null;
  const variantAvailable = (v: (typeof p.product_variants)[number]) =>
    isVariantAvailable(
      {
        productStatus: p.status ?? "active",
        inventoryTracked: v.inventory_tracked ?? false,
        inventoryPolicy: v.inventory_policy ?? null,
        inventoryQuantity: v.inventory_quantity ?? 0,
      },
      1
    );
  const available = p.product_variants.some(variantAvailable);
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    image: sorted[0] ? mediaUrl(sorted[0].storage_path) : null,
    price: variant?.price ?? 0,
    compareAtPrice: variant?.compare_at_price ?? null,
    sku,
    available,
    quickAddVariantId: p.product_variants.length === 1 ? p.product_variants[0].id ?? null : null,
    variants: p.product_variants
      .filter((v) => v.id)
      .map((v) => ({
        id: v.id!,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        option1: v.option1 ?? null,
        option2: v.option2 ?? null,
        option3: v.option3 ?? null,
        available: variantAvailable(v),
        image: imageByVariantId[v.id!] ?? null,
      })),
  };
}

/** Product cards for a collection, by its real Shopify handle, ordered by the real position Shopify stores. */
export async function getCollectionProductCards(handle: string, limit: number, offset = 0): Promise<ProductCard[]> {
  const { data: collection } = await supabase.from("collections").select("id").eq("handle", handle).single();
  if (!collection) return [];

  const { data } = await supabase
    .from("collection_products")
    .select(
      "position, products!inner(id, title, handle, status, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy))"
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
      "id, title, handle, status, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy)",
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
  id: string;
  title: string;
  handle: string;
  status?: string;
  created_at?: string;
  media: { storage_path: string; position: number; variant_id?: string | null }[];
  product_variants: {
    id?: string;
    sku?: string | null;
    price: number;
    compare_at_price: number | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    inventory_quantity?: number;
    inventory_tracked?: boolean;
    inventory_policy?: string | null;
  }[];
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
      "products!inner(id, title, handle, status, created_at, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy))"
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
    .select("id, title, handle, status, created_at, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy)")
    .eq("status", "active");

  return sortFilterPaginate((data ?? []) as RawProductRow[], options, limit, offset);
}

export { hasActiveFilter };

// Powers generateStaticParams for /collections/[handle] -- a tiny, single-column query. See
// getAllProductHandles for why this matters: without generateStaticParams, Next.js treats a
// dynamic segment as fully dynamic (no caching at all, `revalidate` silently inert) rather than
// ISR-cached. "all" is a reserved, code-only handle (no real collections row) -- added by the
// caller, not here.
export async function getAllCollectionHandles(): Promise<string[]> {
  const { data } = await supabase.from("collections").select("handle");
  return (data ?? []).map((c) => c.handle as string);
}

export async function getCollectionsByHandles(handles: string[]) {
  const { data } = await supabase.from("collections").select("title, handle, image_url").in("handle", handles);
  const byHandle = new Map((data ?? []).map((c) => [c.handle, c]));
  // preserve the caller's order (the real theme's configured collection_list order)
  return handles.map((h) => byHandle.get(h)).filter(Boolean) as { title: string; handle: string; image_url: string | null }[];
}

// cache()'d for the same reason as getProductByHandle -- the collection page's generateMetadata()
// and its page component both call this with the same handle.
export const getCollectionMeta = cache(async (handle: string) => {
  const { data } = await supabase
    .from("collections")
    .select("title, handle, description_html, image_url, seo_title, seo_description, template_suffix")
    .eq("handle", handle)
    .single();
  return data;
});

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

export type ProductFeedItem = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  available: boolean;
  // Every real collection (by handle) this product belongs to -- a product can be in several,
  // so this is an array, not a single value. Rendered into the feed as a comma-joined
  // custom_label (Meta/Google's own recommended mechanism for product-set rules): one rule per
  // collection with a "contains <handle>" match recreates a per-collection product set in
  // Commerce Manager, which is how a specific collection gets imported for a Meta ad set.
  collectionHandles: string[];
};

/** collection_products has well over 1000 rows, past PostgREST's default page cap -- paginates
 * explicitly instead of trusting one unbounded select to return everything, which would silently
 * truncate the feed's collection labels to whatever sorted into the first page. */
async function fetchAllCollectionProductLinks(): Promise<{ product_id: string; collections: { handle: string } | null }[]> {
  const PAGE_SIZE = 1000;
  const all: { product_id: string; collections: { handle: string } | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await supabase
      .from("collection_products")
      .select("product_id, collections(handle)")
      .range(offset, offset + PAGE_SIZE - 1);
    const page = (data ?? []) as any[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

/** Real, active catalog data for the public Google Shopping/Meta-catalog-compatible product feed
 * (app/feed/products.xml). Every value here is already-real Supabase data -- nothing is invented
 * for the feed. */
export async function getProductFeedItems(): Promise<ProductFeedItem[]> {
  const [{ data }, collectionLinks] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, title, handle, description_html, status, media(storage_path, position), product_variants(price, compare_at_price, inventory_quantity, inventory_tracked, inventory_policy)"
      )
      .eq("status", "active")
      .order("title", { ascending: true }),
    fetchAllCollectionProductLinks(),
  ]);

  const collectionHandlesByProductId = new Map<string, string[]>();
  for (const link of collectionLinks) {
    const handle = link.collections?.handle;
    if (!handle) continue;
    const existing = collectionHandlesByProductId.get(link.product_id) ?? [];
    existing.push(handle);
    collectionHandlesByProductId.set(link.product_id, existing);
  }

  return (data ?? []).map((p: any) => {
    const card = toCard(p);
    return {
      id: p.id,
      handle: card.handle,
      title: card.title,
      descriptionHtml: p.description_html ?? null,
      image: card.image,
      price: card.price,
      compareAtPrice: card.compareAtPrice,
      collectionHandles: collectionHandlesByProductId.get(p.id) ?? [],
      currency: "SEK",
      available: card.available,
    };
  });
}

// Powers generateStaticParams for /products/[handle]. Without generateStaticParams, Next.js 15
// treats a dynamic route segment as fully dynamic -- confirmed via the real build output, which
// showed /products/[handle] and /collections/[handle] both marked "ƒ (Dynamic)" with no
// Revalidate/Expire column, unlike "/" (correctly "○ (Static)", revalidate: 1m). The existing
// `export const revalidate = 60` on both pages was therefore never actually taking effect -- every
// single product/collection view has been a full, uncached SSR render + Supabase round trip,
// despite the code's own stated intent. Adding this (a tiny single-column query) is what actually
// enables ISR caching for the two highest-traffic page types on the whole site. Only active
// products are prerendered -- a draft/archived handle correctly still 404s via the page's own
// notFound() check, this just controls which paths are warmed at build/deploy time (dynamicParams
// stays true by default, so any other real handle is still generated -- and then cached -- on its
// first real visit).
export async function getAllProductHandles(): Promise<string[]> {
  const { data } = await supabase.from("products").select("handle").eq("status", "active");
  return (data ?? []).map((p) => p.handle as string);
}

// cache() dedupes this within a single request: the product page's generateMetadata() and its
// page component both call this with the same handle -- without it, that's two full serial
// round trips to Supabase before the page can start rendering. Reviews are embedded directly in
// this same query (a real FK, reviews.product_id -> products.id, so PostgREST can nest it) rather
// than a second sequential round trip -- this alone used to add a full extra request to the
// critical path of every product page.
export const getProductByHandle = cache(async (handle: string) => {
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, shopify_id, title, handle, description_html, vendor, tags, seo_title, seo_description, status, template_suffix, media(shopify_id, storage_path, position, alt_text, variant_id), product_variants(id, title, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy), reviews(rating, author_name, body, verified_buyer, created_at, merchant_reply_body, merchant_reply_at)"
    )
    .eq("handle", handle)
    .single();
  if (!product) return null;

  const reviews = [...product.reviews].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const sortedMedia = [...product.media].sort((a, b) => a.position - b.position);
  const images = sortedMedia.map((m) => mediaUrl(m.storage_path));
  const variants = [...product.product_variants];
  const options = Array.from(new Set(variants.map((v) => v.option1).filter(Boolean))) as string[];

  // Real per-variant image links (Shopify's own variant.image), where that data exists -- lets
  // the gallery jump to the right photo when a color/variant option is selected.
  const variantImageIndex: Record<string, number> = {};
  sortedMedia.forEach((m, i) => {
    if (m.variant_id) variantImageIndex[m.variant_id] = i;
  });

  return { ...product, images, variants, sizeOptions: options, reviews: reviews ?? [], variantImageIndex };
});

/** Real-time eligibility check for the "Valfri Plånbok" wallet promo link -- matches the exact
 * product-for-product BXGY shape against the live `discounts` table (public-read RLS, no secrets
 * in that table), so the link only ever appears on bags genuinely in an active promotion's
 * buy_item_ids, not just products sharing the same display template. Never touches
 * lib/discounts.ts's checkout-time calculation logic -- this is a read-only display gate. */
export async function isEligibleForWalletPromo(productShopifyId: string | null): Promise<boolean> {
  if (!productShopifyId) return false;
  const { data } = await supabase
    .from("discounts")
    .select("buy_item_ids")
    .eq("status", "active")
    .eq("buy_item_type", "product")
    .eq("get_item_type", "product");
  return (data ?? []).some((d) => (d.buy_item_ids as string[] | null)?.includes(productShopifyId));
}

/** "Passar med" -- manually curated complementary products (product_complementary), entirely
 * separate from getRelatedProductCards' automatic recommendations above. Only the admin's own
 * manual selections are ever returned, in the admin's own chosen order; excludes unpublished
 * products. */
export async function getComplementaryProductCards(productId: string, limit = 8): Promise<ProductCard[]> {
  const { data } = await supabase
    .from("product_complementary")
    .select(
      "position, products!product_complementary_complementary_product_id_fkey!inner(id, title, handle, status, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy))"
    )
    .eq("product_id", productId)
    .eq("products.status", "active")
    .order("position", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row: any) => toCard(row.products));
}

export async function searchProductCards(query: string, limit = 24): Promise<ProductCard[]> {
  if (!query.trim()) return [];
  const { data } = await supabase
    .from("products")
    .select(
      "id, title, handle, status, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy)"
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

  // Fetched in parallel (there are only ever a handful of candidate collections per product) --
  // the dedup/pick logic below stays sequential (so results still prefer the most-specific
  // collection first, exactly as before), but the network round trips themselves no longer wait
  // on each other, which used to serialize 2-3+ extra round trips onto every product page load.
  const perCollectionResults = await Promise.all(
    withCounts.map((collection) =>
      supabase
        .from("collection_products")
        .select(
          "position, products!inner(id, title, handle, status, media(storage_path, position, variant_id), product_variants(id, sku, price, compare_at_price, option1, option2, option3, inventory_quantity, inventory_tracked, inventory_policy))"
        )
        .eq("collection_id", collection.id)
        .eq("products.status", "active")
        .order("position", { ascending: true })
        .limit(limit * 2)
        .then(({ data }) => (data ?? []) as any[])
    )
  );

  const picked: any[] = [];
  const seenHandles = new Set([excludeHandle]);

  for (const rows of perCollectionResults) {
    if (picked.length >= limit) break;
    for (const row of rows) {
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

export type HomeSection = { id: string; type: string; visible: boolean; config: Record<string, unknown> };

/**
 * The homepage's real, live section list -- RLS (migration 0020) means this anon-key client can
 * only ever see the `status='published'` row, never the admin's draft. Returns [] (never throws)
 * if no published layout exists yet, so the homepage degrades to an empty page rather than erroring.
 */
export async function getPublishedHomeSections(page = "home"): Promise<HomeSection[]> {
  const { data } = await supabase.from("storefront_layouts").select("sections").eq("page", page).eq("status", "published").maybeSingle();
  return (data?.sections as HomeSection[] | undefined) ?? [];
}

export type NavLink = { title: string; href: string };
export type SiteMenus = { mainMenu: NavLink[]; footer: NavLink[]; about: NavLink[]; terms: NavLink[]; social: NavLink[] };

/**
 * All 5 real site menus (header + footer columns) in one query, read by the root layout on every
 * page load. Replaces components/layout/header.tsx's/footer.tsx's previously-hardcoded arrays.
 */
export async function getSiteMenus(): Promise<SiteMenus> {
  const { data } = await supabase.from("storefront_menus").select("handle, storefront_menu_items(title, href, position)");
  const byHandle = new Map((data ?? []).map((m: any) => [m.handle, (m.storefront_menu_items ?? []).sort((a: any, b: any) => a.position - b.position).map((i: any) => ({ title: i.title, href: i.href }))]));
  return {
    mainMenu: byHandle.get("main-menu") ?? [],
    footer: byHandle.get("footer") ?? [],
    about: byHandle.get("about") ?? [],
    terms: byHandle.get("terms") ?? [],
    social: byHandle.get("social") ?? [],
  };
}

/** Admin-set logo override (store_settings.logo_url); null means "use the default static logo". */
export async function getLogoUrl(): Promise<string | null> {
  const { data } = await supabase.from("store_settings").select("value").eq("key", "logo_url").maybeSingle();
  return (data?.value as string | null) ?? null;
}
