// Shared, pure display-line builder -- used by both components/cart/cart-drawer.tsx and
// app/(storefront)/kassa/page.tsx so the two surfaces can never disagree about which units of a
// cart item are paid vs. free. Reads (never recomputes) the already-authoritative output of
// computeCheckoutTotals() -- the discount CALCULATION itself lives entirely in lib/discounts.ts
// and is untouched by this file.
import type { CartItem } from "@/components/cart/cart-provider";
import type { CheckoutTotals } from "@/lib/discounts";

export type DisplayLine = {
  key: string;
  variantId: string;
  productHandle: string;
  title: string;
  variantTitle: string;
  image: string | null;
  qty: number;
  unitPrice: number; // 0 for a free line
  // Preserved verbatim from the cart item's own real compare_at_price -- never recomputed from a
  // discount, never invented when the product has none. On a free line, this is the item's own
  // current/regular selling price (not compare-at), shown crossed-out next to "0 kr".
  compareAtPrice: number | null;
  lineTotal: number;
  isFree: boolean;
  freeLabel: string | null; // e.g. "Gratis (3 för 2)" -- which promotion made this line free
  // Active BXGY promotions (e.g. "3 för 2") this row's variant participates in, whether or not
  // this specific row ended up free -- e.g. the paid row of a split pair still shows "3 för 2"
  // so the customer sees why the group is being tracked. Empty when not eligible for any.
  eligibleLabels: string[];
  // "Du sparar" amount for a free row -- just the current selling price times its quantity (the
  // actual value given away). Always 0 on a paid row (that savings, if any, is the existing
  // markdown-only "Du sparar" already shown next to its own crossed-out price).
  savedAmount: number;
};

export type CartSummary = {
  originalSubtotal: number; // "Delsumma" -- sum of every unit (incl. free ones) at its CURRENT selling price
  totalSavings: number; // "Total rabatt" -- the real discount amount only (free units + code)
  total: number; // final payable amount, unchanged from totals.total
};

// Delsumma/Total rabatt are now a direct pass-through of the already-authoritative
// computeCheckoutTotals() output (current/selling price, not compare-at) -- no per-item markdown
// math is added in here anymore. Shared by cart-drawer.tsx and kassa/page.tsx so the two surfaces
// can't disagree.
export function buildCartSummary(items: CartItem[], totals: CheckoutTotals | null): CartSummary | null {
  if (!totals) return null;
  return { originalSubtotal: totals.subtotal, totalSavings: totals.discountTotal, total: totals.total };
}

export function buildDisplayLines(items: CartItem[], totals: CheckoutTotals | null): DisplayLine[] {
  // freeVariantIds is a flat array with one entry per free UNIT (duplicates mean multiple free
  // units of that variant) -- see lib/discounts.ts's computeCheckoutTotals. Sum counts per variant
  // across every applied BXGY discount, and remember which discount's title to label each line with.
  const freeCounts = new Map<string, number>();
  const freeLabels = new Map<string, string>();
  if (totals) {
    for (const d of totals.appliedDiscounts) {
      for (const variantId of d.freeVariantIds ?? []) {
        freeCounts.set(variantId, (freeCounts.get(variantId) ?? 0) + 1);
        if (!freeLabels.has(variantId)) freeLabels.set(variantId, d.title);
      }
    }
  }

  const lines: DisplayLine[] = [];
  for (const item of items) {
    // qty is always the client's own cart state -- it's the user's own just-clicked +/-/remove
    // input, never something to wait on a server round trip for (deferring to a stale server copy
    // here used to make the qty steppers visibly lag behind every click until the debounced
    // totals refetch resolved). unitPrice genuinely depends on server-side discount computation,
    // so that still prefers the server-recomputed totals.lines when loaded, falling back to the
    // client item only while totals is still loading, same convention as useCartTotals elsewhere.
    const serverLine = totals?.lines.find((l) => l.variantId === item.variantId);
    const qty = item.qty;
    const unitPrice = serverLine?.unitPrice ?? item.price;
    const freeQty = Math.min(freeCounts.get(item.variantId) ?? 0, qty);
    const paidQty = qty - freeQty;
    const eligibleLabels = totals?.eligibleDiscountsByVariant[item.variantId] ?? [];

    if (paidQty > 0) {
      lines.push({
        key: `${item.variantId}-paid`,
        variantId: item.variantId,
        productHandle: item.productHandle,
        title: item.title,
        variantTitle: item.variantTitle,
        image: item.image,
        qty: paidQty,
        unitPrice,
        compareAtPrice: item.compareAtPrice,
        lineTotal: unitPrice * paidQty,
        isFree: false,
        freeLabel: null,
        eligibleLabels,
        savedAmount: 0,
      });
    }
    if (freeQty > 0) {
      lines.push({
        key: `${item.variantId}-free`,
        variantId: item.variantId,
        productHandle: item.productHandle,
        title: item.title,
        variantTitle: item.variantTitle,
        image: item.image,
        qty: freeQty,
        unitPrice: 0,
        compareAtPrice: unitPrice,
        lineTotal: 0,
        isFree: true,
        freeLabel: freeLabels.get(item.variantId) ?? null,
        eligibleLabels,
        savedAmount: unitPrice * freeQty,
      });
    }
  }
  return lines;
}
