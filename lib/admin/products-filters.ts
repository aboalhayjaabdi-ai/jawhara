export type ProductsListFilters = {
  q?: string;
  status?: string;
  vendor?: string;
  collectionId?: string;
  stockLevel?: "low" | "out" | "untracked";
  sort?: "title" | "created_at";
  dir?: "asc" | "desc";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

/** Shared between the product list page and the CSV export route, mirroring lib/admin/orders-filters.ts. */
export function parseProductsListFilters(sp: SearchParams): ProductsListFilters {
  return {
    q: one(sp.q),
    status: one(sp.status),
    vendor: one(sp.vendor),
    collectionId: one(sp.collectionId),
    stockLevel: one(sp.stockLevel) as ProductsListFilters["stockLevel"],
    sort: (one(sp.sort) as ProductsListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as ProductsListFilters["dir"]) ?? "desc",
  };
}

/** Applies the q/status/vendor/sort filters to a products-rooted query builder. `collectionId` and
 * `stockLevel` can't be expressed as a plain predicate on `products` alone (they depend on
 * `collection_products`/`product_variants`), so callers resolve those separately (see
 * app/admin/(authenticated)/products/page.tsx) and pass the resulting product ids via a
 * pre-filtered `baseIds` array instead. */
export function applyProductsListFilters<T extends { or: Function; eq: Function; order: Function; in: Function }>(
  query: T,
  filters: ProductsListFilters,
  baseIds?: string[]
): T {
  let q: any = query;
  if (filters.q) q = q.or(`title.ilike.%${filters.q}%,vendor.ilike.%${filters.q}%`);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.vendor) q = q.eq("vendor", filters.vendor);
  if (baseIds) q = q.in("id", baseIds);
  q = q.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });
  return q;
}
