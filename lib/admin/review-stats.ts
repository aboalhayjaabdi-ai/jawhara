import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/review-stats.ts must never be imported into client code");
}

export type ReviewStats = {
  total: number;
  avgRating: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  verifiedCount: number;
  verifiedPercent: number | null;
  repliedCount: number;
};

export type TopReviewedProduct = {
  productId: string;
  title: string;
  reviewCount: number;
  avgRating: number;
};

/**
 * Store-wide review statistics, computed live from the real `reviews` table -- never a stored/
 * stale column. Used by the moderation queue's header tiles.
 */
export async function getReviewStats(): Promise<ReviewStats> {
  const { data } = await supabaseService.from("reviews").select("rating, status, verified_buyer, merchant_reply_body");
  const rows = data ?? [];

  const distribution: ReviewStats["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let verifiedCount = 0;
  let repliedCount = 0;

  for (const r of rows) {
    const rating = r.rating as 1 | 2 | 3 | 4 | 5;
    if (rating in distribution) distribution[rating] += 1;
    ratingSum += r.rating;
    if (r.status === "pending") pendingCount += 1;
    else if (r.status === "approved") approvedCount += 1;
    else if (r.status === "rejected") rejectedCount += 1;
    if (r.verified_buyer) verifiedCount += 1;
    if (r.merchant_reply_body) repliedCount += 1;
  }

  return {
    total: rows.length,
    avgRating: rows.length ? ratingSum / rows.length : null,
    distribution,
    pendingCount,
    approvedCount,
    rejectedCount,
    verifiedCount,
    verifiedPercent: rows.length ? (verifiedCount / rows.length) * 100 : null,
    repliedCount,
  };
}

/** Top 10 most-reviewed products by real review count, for the stats view. */
export async function getTopReviewedProducts(limit = 10): Promise<TopReviewedProduct[]> {
  const { data } = await supabaseService.from("reviews").select("product_id, rating").eq("status", "approved");
  const rows = data ?? [];
  const byProduct = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const existing = byProduct.get(r.product_id) ?? { count: 0, sum: 0 };
    existing.count += 1;
    existing.sum += r.rating;
    byProduct.set(r.product_id, existing);
  }

  const productIds = Array.from(byProduct.keys());
  if (productIds.length === 0) return [];

  const { data: products } = await supabaseService.from("products").select("id, title").in("id", productIds);
  const titleById = new Map((products ?? []).map((p) => [p.id, p.title as string]));

  return productIds
    .map((productId) => {
      const stat = byProduct.get(productId)!;
      return {
        productId,
        title: titleById.get(productId) ?? "(okänd produkt)",
        reviewCount: stat.count,
        avgRating: stat.sum / stat.count,
      };
    })
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, limit);
}
