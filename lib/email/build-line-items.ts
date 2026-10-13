import { getOrderItemImages } from "@/lib/order-images";
import { normalizeVariantTitle } from "@/lib/variant-title";
import type { OrderLineItem } from "./templates";

export type RawOrderItemRow = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  variantId: string | null;
  productId: string | null;
  variantTitle?: string | null;
};

/** The single place every transactional email resolves a line item's display data -- the exact
 * purchased-variant image (lib/order-images.ts, already proven in the admin order detail page),
 * the real variant title with Shopify's "Default Title" sentinel hidden (lib/variant-title.ts,
 * already proven in the cart drawer) -- so order confirmation, shipping confirmation, refund, and
 * cancellation emails can never drift from what the storefront/admin already show for the same
 * order item. */
export async function buildEmailLineItems(rows: RawOrderItemRow[]): Promise<OrderLineItem[]> {
  const images = await getOrderItemImages(rows.map((r) => ({ id: r.id, variantId: r.variantId, productId: r.productId })));
  return rows.map((r) => ({
    title: r.title,
    variantTitle: normalizeVariantTitle(r.variantTitle),
    qty: r.quantity,
    unitPrice: r.unitPrice,
    imageUrl: images[r.id]?.imageUrl ?? null,
  }));
}
