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
  // The immutable snapshot taken when the order was first synced (order_items.image_url/
  // variant_title_snapshot) -- when present, this is used VERBATIM instead of a live lookup, so
  // an email always shows exactly what the customer bought even if the product's media or
  // variant has since changed. Only absent for order items synced before the snapshot mechanism
  // existed, which still get the old live-lookup behavior as a fallback.
  imageUrlSnapshot?: string | null;
  variantTitleSnapshot?: string | null;
};

/** The single place every transactional email resolves a line item's display data -- the exact
 * purchased-variant image (lib/order-images.ts, already proven in the admin order detail page),
 * the real variant title with Shopify's "Default Title" sentinel hidden (lib/variant-title.ts,
 * already proven in the cart drawer) -- so order confirmation, shipping confirmation, refund, and
 * cancellation emails can never drift from what the storefront/admin already show for the same
 * order item. Prefers each row's own immutable snapshot (see RawOrderItemRow.imageUrlSnapshot)
 * over a live lookup whenever one was taken. */
export async function buildEmailLineItems(rows: RawOrderItemRow[]): Promise<OrderLineItem[]> {
  const needsLiveLookup = rows.filter((r) => r.imageUrlSnapshot === undefined);
  const images = needsLiveLookup.length
    ? await getOrderItemImages(needsLiveLookup.map((r) => ({ id: r.id, variantId: r.variantId, productId: r.productId })))
    : {};
  return rows.map((r) => ({
    title: r.title,
    variantTitle: normalizeVariantTitle(r.variantTitleSnapshot !== undefined ? r.variantTitleSnapshot : r.variantTitle),
    qty: r.quantity,
    unitPrice: r.unitPrice,
    imageUrl: r.imageUrlSnapshot !== undefined ? r.imageUrlSnapshot : images[r.id]?.imageUrl ?? null,
  }));
}
