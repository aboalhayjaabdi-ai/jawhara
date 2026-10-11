export type OrdersListFilters = {
  q?: string;
  status?: string;
  fulfillment?: string;
  provider?: "shopify" | "stripe" | "manual";
  from?: string;
  to?: string;
  sort?: "created_at" | "total_price";
  dir?: "asc" | "desc";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

/** Shared between the order list page and the CSV export route, so filter logic lives in one place. */
export function parseOrdersListFilters(sp: SearchParams): OrdersListFilters {
  return {
    q: one(sp.q),
    status: one(sp.status),
    fulfillment: one(sp.fulfillment),
    provider: one(sp.provider) as OrdersListFilters["provider"],
    from: one(sp.from),
    to: one(sp.to),
    sort: (one(sp.sort) as OrdersListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as OrdersListFilters["dir"]) ?? "desc",
  };
}

/** Applies the filters to a Supabase query builder. Typed loosely (the PostgREST builder's generic
 * chaining type is unwieldy for a shared helper) -- this is an internal admin-only utility. */
export function applyOrdersListFilters<T extends { or: Function; eq: Function; gte: Function; lte: Function; order: Function }>(
  query: T,
  filters: OrdersListFilters
): T {
  let q: any = query;
  if (filters.q) q = q.or(`order_number.ilike.%${filters.q}%,email.ilike.%${filters.q}%`);
  if (filters.status) q = q.eq("financial_status", filters.status);
  if (filters.fulfillment) q = q.eq("fulfillment_status", filters.fulfillment);
  if (filters.provider) q = q.eq("source", filters.provider);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  q = q.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });
  return q;
}
