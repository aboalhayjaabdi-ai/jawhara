/**
 * Delivery-time info box on bag product pages (components/product/product-detail.tsx, just under
 * the price and the Black Month line, before the product description).
 *
 * Decided purely from the product's collection membership on the website (Supabase
 * collection_products -- NOT Shopify's, which differs), verified against jawhara.se 2026-11-11:
 *   - "H väskor" (handle h-vaskor) always wins: its products have the regular delivery time and
 *     show NO delivery-time box, even though they are also in "Väskor" (or any other collection).
 *     Noélle Mini (collection noelle-mini-vaskor) are all H bags on the website and are treated the
 *     same way, so they never get the 3–4 week text either.
 *   - Every other product in "Väskor" (handle vaskor-och-tillbehor) or one of its website
 *     sub-categories (LV, GG, DI, YSL, CC, MIU, JACQ) shows "Leveranstid: 3–4 veckor".
 *   - Every gift set ("Gift sets", handle gift-sets) also shows "Leveranstid: 3–4 veckor".
 *   - Everything else (jewelry, wallets/"Plånböcker", ...) gets no box.
 * Only ever one box per product -- getDeliveryTimeNote returns a single string or null.
 */

/** "Väskor" plus its sub-categories on the website, so a bag only placed in a sub-category still
 * counts as a bag. */
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
  // Gift sets aren't in "Väskor" on the website but have the same longer delivery time.
  "gift-sets",
]);

/** Collections whose products always have the regular delivery time (highest priority). */
const REGULAR_DELIVERY_COLLECTION_HANDLES = new Set(["h-vaskor", "noelle-mini-vaskor"]);

export const DELIVERY_TIME_LONG = "Leveranstid: 3–4 veckor";
/** The delivery-time text for a product given its collection handles, or null when no box is shown
 * (H bags -- regular delivery time -- and everything that isn't a bag or gift set). */
export function getDeliveryTimeNote(collectionHandles: readonly string[]): string | null {
  if (collectionHandles.some((h) => REGULAR_DELIVERY_COLLECTION_HANDLES.has(h))) return null;
  if (collectionHandles.some((h) => BAG_COLLECTION_HANDLES.has(h))) return DELIVERY_TIME_LONG;
  return null;
}

/** Cart delivery group: "long" for products with the longer delivery time (same rule as
 * getDeliveryTimeNote above -- they get the delivery-time note under their name in the cart),
 * "regular" for everything else. */
export type CartDeliveryGroup = "long" | "regular";

export function getCartDeliveryGroup(collectionHandles: readonly string[]): CartDeliveryGroup {
  return getDeliveryTimeNote(collectionHandles) === DELIVERY_TIME_LONG ? "long" : "regular";
}
