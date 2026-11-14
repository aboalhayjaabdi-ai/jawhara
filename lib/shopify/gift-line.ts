import { activeStore, type StoreKey } from "./stores";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/gift-line.ts must never be imported into client code");
}

// "Valfritt Smycke" (buy a bag, get any piece of jewelry free) must be independent of "3 för 2":
// the free piece may never count towards 3 för 2. Shopify's native discounts can't do that on this
// plan -- a "3 för 2" collection discount always counts every jewelry line in the checkout, and only
// one product discount can apply per item. So the free piece is NOT sent to Shopify as the real
// jewelry variant: it goes to checkout as a line of a hidden 0 kr product ("Gåva – valfritt
// smycke", no image, published only to the headless channel), with the chosen piece named in the
// line's attributes. 3 för 2 then only sees the jewelry the customer pays for, and the native
// "Valfritt Smycke" discount is kept switched off in Shopify (lib/shopify/discount-sync.ts) so it
// can't make a second piece free. The Jawhara cart itself is unchanged: it still holds the real
// jewelry (with its own image) and lib/discounts.ts prices it at 0 kr.
//
// null = no gift product in that store: the free piece is sent as the real variant (the old
// behaviour, with Shopify's own discount making it free).
const GIFT_LINE_VARIANT: Record<StoreKey, string | null> = {
  new: null,
  legacy: null,
};

/** Visible line attribute: which piece the customer chose ("H armband – 17 cm"). */
export const GIFT_ATTR_ITEM = "Smycke";
/** Hidden line attribute ("_" prefix): the Jawhara product_variants.id of the chosen piece, read
 * back by order sync (lib/shopify/order-sync-shared.ts) so the order item points at the real piece. */
export const GIFT_ATTR_VARIANT = "_jw_variant";

export function giftLineVariantGid(store: StoreKey = activeStore()): string | null {
  return GIFT_LINE_VARIANT[store];
}

type DiscountShape = {
  kind: string;
  buy_quantity: number | null;
  get_quantity: number | null;
  buy_item_type: string | null;
  buy_item_ids: string[] | null;
  get_item_type: string | null;
  get_item_ids: string[] | null;
  get_percentage: string | number | null;
};

/** An automatic buy-X-get-Y whose buy and get sets differ and whose gift is 100 % off -- i.e. the
 * bag gift offer ("Valfritt Smycke"), as opposed to "3 för 2" (same set on both sides). */
export function isGiftOffer(d: DiscountShape): boolean {
  if (d.kind !== "automatic" || d.buy_quantity == null || d.get_quantity == null) return false;
  if (Number(d.get_percentage ?? 0) !== 100) return false;
  const sorted = (ids: string[] | null) => JSON.stringify([...(ids ?? [])].sort());
  return !(d.buy_item_type === d.get_item_type && sorted(d.buy_item_ids) === sorted(d.get_item_ids));
}
