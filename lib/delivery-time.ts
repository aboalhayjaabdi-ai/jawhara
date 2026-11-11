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
 *   - Noélle Mini bags get no box at all: anything in the "Noelle mini väskor" collection
 *     (handle noelle-mini-vaskor) or with a noelle-vaska-mini* product handle. Checked first.
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
]);

/** Noélle Mini: excluded entirely (no delivery-time box). Matched by collection and, since those
 * products aren't reliably in that collection, by product handle too. */
const EXCLUDED_COLLECTION_HANDLES = new Set(["noelle-mini-vaskor"]);
const EXCLUDED_PRODUCT_HANDLE_PREFIX = "noelle-vaska-mini";

/** Collection whose products always have the regular delivery time (highest priority). */
const REGULAR_DELIVERY_COLLECTION_HANDLE = "h-vaskor";

export const DELIVERY_TIME_LONG = "Längre leveranstid: 3–5 veckor";
export const DELIVERY_TIME_REGULAR = "Ordinarie leveranstid";

/** The delivery-time text for a product given its handle and collection handles, or null for
 * non-bags and excluded products. */
export function getDeliveryTimeNote(productHandle: string, collectionHandles: readonly string[]): string | null {
  if (productHandle.startsWith(EXCLUDED_PRODUCT_HANDLE_PREFIX)) return null;
  if (collectionHandles.some((h) => EXCLUDED_COLLECTION_HANDLES.has(h))) return null;
  if (collectionHandles.includes(REGULAR_DELIVERY_COLLECTION_HANDLE)) return DELIVERY_TIME_REGULAR;
  if (collectionHandles.some((h) => BAG_COLLECTION_HANDLES.has(h))) return DELIVERY_TIME_LONG;
  return null;
}
