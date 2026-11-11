/**
 * Delivery-time info box on bag product pages (components/product/product-detail.tsx, just under
 * the price and the Black Month line, before the product description).
 *
 * Decided purely from the product's real collection membership (Supabase collection_products,
 * mirrored from Shopify), verified against the live store 2026-11-11:
 *   - "Väskor" (handle vaskor-och-tillbehor) is the main bag collection; every bag, every brand
 *     sub-collection's bag and every gift set is in it. Wallets ("Plånböcker", handle tillbehor)
 *     and jewelry are not, so they get no box.
 *   - "H väskor" (handle h-vaskor) always wins: a product in it shows the regular delivery time
 *     even though it is also in "Väskor" (or any other collection).
 * Only ever one box per product -- getDeliveryTimeNote returns a single string or null.
 */

/** Main bag collection plus every bag sub-collection, so a bag only placed in a sub-collection
 * still counts as a bag. */
const BAG_COLLECTION_HANDLES = new Set([
  "vaskor-och-tillbehor",
  "lv-vaskor",
  "gg-vaskor",
  "h-vaskor",
  "di-vaskor",
  "ysl-vaskor",
  "cc-vaskor",
  "miu-vaskor",
  "jacq-vaskor",
  "meta-vaskor",
  "noelle-mini-vaskor",
]);

/** Collection whose products always have the regular delivery time (highest priority). */
const REGULAR_DELIVERY_COLLECTION_HANDLE = "h-vaskor";

export const DELIVERY_TIME_LONG = "Längre leveranstid: 3–5 veckor";
export const DELIVERY_TIME_REGULAR = "Ordinarie leveranstid";

/** The delivery-time text for a product given its collection handles, or null for non-bags. */
export function getDeliveryTimeNote(collectionHandles: readonly string[]): string | null {
  if (collectionHandles.includes(REGULAR_DELIVERY_COLLECTION_HANDLE)) return DELIVERY_TIME_REGULAR;
  if (collectionHandles.some((h) => BAG_COLLECTION_HANDLES.has(h))) return DELIVERY_TIME_LONG;
  return null;
}
