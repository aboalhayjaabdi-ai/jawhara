import { supabaseService } from "@/lib/supabase/service-client";
import { checkProductDiscountImpact, type DiscountImpact } from "@/lib/admin/discount-guard";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/product-delete-impact.ts must never be imported into client code");
}

export type ProductDeleteImpact = {
  reviewCount: number;
  orderItemCount: number;
  discountImpact: DiscountImpact;
};

/**
 * Read-only, shown in every delete/archive confirmation dialog (single and bulk). reviews.product_id
 * is `on delete cascade` (deleting the product silently destroys its reviews too -- surfaced here,
 * never silent); order_items.product_id is `on delete set null` (historical orders survive --
 * title/sku/price are already denormalized onto the row -- surfaced for transparency, not as a
 * blocker).
 */
export async function getProductDeleteImpact(productId: string): Promise<ProductDeleteImpact> {
  const [{ count: reviewCount }, { count: orderItemCount }, discountImpact] = await Promise.all([
    supabaseService.from("reviews").select("id", { count: "exact", head: true }).eq("product_id", productId),
    supabaseService.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId),
    checkProductDiscountImpact(productId),
  ]);
  return { reviewCount: reviewCount ?? 0, orderItemCount: orderItemCount ?? 0, discountImpact };
}
