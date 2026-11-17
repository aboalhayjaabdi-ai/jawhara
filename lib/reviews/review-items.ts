import { supabaseService } from "@/lib/supabase/service-client";
import { buildReviewLinkUrl } from "@/lib/reviews/token";
import { getOrderItemImages } from "@/lib/order-images";
import { normalizeVariantTitle } from "@/lib/variant-title";
import type { ReviewRequestItem } from "@/lib/email/templates";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/review-items.ts must never be imported into client code");
}

/**
 * The "Skriv en recension" rows for one order: one per distinct product still on sale (not per
 * variant/line item), each with its image and its own signed review link (verified purchase).
 * Shared by the review-request email and the "Har du fått ditt paket?" email.
 */
export async function buildReviewItemsForOrder(orderId: string, siteUrl: string): Promise<ReviewRequestItem[]> {
  const { data: items } = await supabaseService
    .from("order_items")
    .select("product_id, title, variant_id, product_variants(title), products(handle, status)")
    .eq("order_id", orderId);

  const byProduct = new Map<string, { title: string; variantTitle: string | null; handle: string; variantId: string | null; productId: string }>();
  for (const i of items ?? []) {
    const product = (i as any).products;
    if (!i.product_id || byProduct.has(i.product_id) || !product?.handle || product.status !== "active") continue;
    byProduct.set(i.product_id, {
      title: i.title,
      // Shopify's "Default Title" (single-variant products) is never shown to customers.
      variantTitle: normalizeVariantTitle((i as any).product_variants?.title ?? null),
      handle: product.handle,
      variantId: i.variant_id,
      productId: i.product_id,
    });
  }
  const products = Array.from(byProduct.values());
  if (products.length === 0) return [];

  const images = await getOrderItemImages(
    products.filter((p) => p.variantId).map((p) => ({ id: p.variantId!, variantId: p.variantId, productId: p.productId }))
  );
  return products.map((p) => ({
    title: p.title,
    variantTitle: p.variantTitle,
    imageUrl: p.variantId ? images[p.variantId]?.imageUrl ?? null : null,
    reviewUrl: buildReviewLinkUrl(p.handle, orderId, p.productId, siteUrl),
  }));
}
