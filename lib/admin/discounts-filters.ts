export type DiscountsListFilters = {
  q?: string;
  kind?: "automatic" | "code";
  status?: "draft" | "scheduled" | "active" | "expired";
  sort?: "title" | "created_at" | "starts_at";
  dir?: "asc" | "desc";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export function parseDiscountsListFilters(sp: SearchParams): DiscountsListFilters {
  return {
    q: one(sp.q),
    kind: one(sp.kind) as DiscountsListFilters["kind"],
    status: one(sp.status) as DiscountsListFilters["status"],
    sort: (one(sp.sort) as DiscountsListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as DiscountsListFilters["dir"]) ?? "desc",
  };
}

export function applyDiscountsListFilters<T extends { or: Function; eq: Function; order: Function }>(
  query: T,
  filters: DiscountsListFilters
): T {
  let q: any = query;
  if (filters.q) q = q.or(`title.ilike.%${filters.q}%,code.ilike.%${filters.q}%`);
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.status) q = q.eq("status", filters.status);
  q = q.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });
  return q;
}
