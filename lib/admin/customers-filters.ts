import type { CustomerListRow } from "./customer-stats";

export type CustomersListFilters = {
  q?: string;
  tag?: string;
  country?: string;
  acceptsMarketing?: "yes" | "no";
  noOrders?: boolean;
  minTotalSpent?: number;
  maxTotalSpent?: number;
  minOrderCount?: number;
  maxOrderCount?: number;
  sort?: "name" | "created_at" | "total_spent" | "order_count" | "last_order_at";
  dir?: "asc" | "desc";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

/** Shared between the customer list page, the CSV export route, and saved-view/segment
 * evaluation -- a saved view's `filters` jsonb is this exact shape, so loading one is a direct
 * parse, not a translation. */
export function parseCustomersListFilters(sp: SearchParams): CustomersListFilters {
  return {
    q: one(sp.q),
    tag: one(sp.tag),
    country: one(sp.country),
    acceptsMarketing: one(sp.acceptsMarketing) as CustomersListFilters["acceptsMarketing"],
    noOrders: one(sp.noOrders) === "1",
    minTotalSpent: one(sp.minTotalSpent) ? Number(one(sp.minTotalSpent)) : undefined,
    maxTotalSpent: one(sp.maxTotalSpent) ? Number(one(sp.maxTotalSpent)) : undefined,
    minOrderCount: one(sp.minOrderCount) ? Number(one(sp.minOrderCount)) : undefined,
    maxOrderCount: one(sp.maxOrderCount) ? Number(one(sp.maxOrderCount)) : undefined,
    sort: (one(sp.sort) as CustomersListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as CustomersListFilters["dir"]) ?? "desc",
  };
}

function customerName(c: CustomerListRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

/** Pure in-memory filter + sort over the already-merged customer+stats+address rows from
 * listCustomersWithStats -- see that function's comment for why this is in-memory rather than a
 * Supabase query-builder chain (the pattern every other entity's *-filters.ts module uses). */
export function applyCustomersListFilters(rows: CustomerListRow[], filters: CustomersListFilters): CustomerListRow[] {
  let result = rows;

  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter((c) => customerName(c).toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q));
  }
  if (filters.tag) result = result.filter((c) => c.tags.includes(filters.tag!));
  if (filters.country) result = result.filter((c) => c.country === filters.country);
  if (filters.acceptsMarketing) result = result.filter((c) => c.acceptsMarketing === (filters.acceptsMarketing === "yes"));
  if (filters.noOrders) result = result.filter((c) => c.orderCount === 0);
  if (filters.minTotalSpent != null) result = result.filter((c) => c.totalSpent >= filters.minTotalSpent!);
  if (filters.maxTotalSpent != null) result = result.filter((c) => c.totalSpent <= filters.maxTotalSpent!);
  if (filters.minOrderCount != null) result = result.filter((c) => c.orderCount >= filters.minOrderCount!);
  if (filters.maxOrderCount != null) result = result.filter((c) => c.orderCount <= filters.maxOrderCount!);

  const dir = filters.dir === "asc" ? 1 : -1;
  const sort = filters.sort ?? "created_at";
  result = [...result].sort((a, b) => {
    let cmp = 0;
    if (sort === "name") cmp = customerName(a).localeCompare(customerName(b));
    else if (sort === "total_spent") cmp = a.totalSpent - b.totalSpent;
    else if (sort === "order_count") cmp = a.orderCount - b.orderCount;
    else if (sort === "last_order_at") cmp = (a.lastOrderAt ?? "").localeCompare(b.lastOrderAt ?? "");
    else cmp = a.createdAt.localeCompare(b.createdAt);
    return cmp * dir;
  });

  return result;
}
