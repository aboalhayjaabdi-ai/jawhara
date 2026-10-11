export type ReviewsListFilters = {
  q?: string;
  status?: "pending" | "approved" | "rejected";
  rating?: number;
  source?: "judgeme" | "manual";
  verified?: boolean;
  productId?: string;
  sort?: "created_at" | "rating" | "status";
  dir?: "asc" | "desc";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export function parseReviewsListFilters(sp: SearchParams): ReviewsListFilters {
  const ratingRaw = one(sp.rating);
  const verifiedRaw = one(sp.verified);
  return {
    q: one(sp.q),
    status: one(sp.status) as ReviewsListFilters["status"],
    rating: ratingRaw ? Number(ratingRaw) : undefined,
    source: one(sp.source) as ReviewsListFilters["source"],
    verified: verifiedRaw === "true" ? true : verifiedRaw === "false" ? false : undefined,
    productId: one(sp.productId),
    sort: (one(sp.sort) as ReviewsListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as ReviewsListFilters["dir"]) ?? "desc",
  };
}

export function applyReviewsListFilters<T extends { or: Function; eq: Function; order: Function }>(
  query: T,
  filters: ReviewsListFilters
): T {
  let q: any = query;
  if (filters.q) q = q.or(`author_name.ilike.%${filters.q}%,body.ilike.%${filters.q}%,customer_email.ilike.%${filters.q}%`);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.rating) q = q.eq("rating", filters.rating);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.verified != null) q = q.eq("verified_buyer", filters.verified);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  q = q.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });
  return q;
}
