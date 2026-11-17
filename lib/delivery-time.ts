/**
 * "Beräknad leverans" line on bag product pages (components/product/product-detail.tsx, just
 * under the "I lager" status): a date range 3–4 weeks from today.
 *
 * Which products get it is decided purely from their collection membership on the website
 * (Supabase collection_products), the same rule the earlier "Leveranstid: 3–4 veckor" box used:
 *   - "H väskor" (handle h-vaskor) and Noélle Mini (noelle-mini-vaskor) always win: regular
 *     delivery time, no line -- even though they are also in "Väskor".
 *   - Every other product in "Väskor" (vaskor-och-tillbehor) or one of its sub-categories (LV, GG,
 *     DI, YSL, CC, MIU, JACQ), and every gift set, shows the line.
 *   - Everything else (jewelry, wallets, ...) gets nothing.
 */

/** "Väskor" plus its sub-categories, and gift sets (same longer delivery time). */
const LONG_DELIVERY_COLLECTION_HANDLES = new Set([
  "vaskor-och-tillbehor",
  "lv-vaskor",
  "gg-vaskor",
  "h-vaskor",
  "di-vaskor",
  "ysl-vaskor",
  "cc-vaskor",
  "miu-vaskor",
  "jacq-vaskor",
  "gift-sets",
]);

/** Collections whose products always have the regular delivery time (highest priority). */
const REGULAR_DELIVERY_COLLECTION_HANDLES = new Set(["h-vaskor", "noelle-mini-vaskor"]);

/** Delivery window in days from today, for products with the longer delivery time. */
export const LONG_DELIVERY_DAYS = { min: 21, max: 28 } as const;

export function hasLongDelivery(collectionHandles: readonly string[]): boolean {
  if (collectionHandles.some((h) => REGULAR_DELIVERY_COLLECTION_HANDLES.has(h))) return false;
  return collectionHandles.some((h) => LONG_DELIVERY_COLLECTION_HANDLES.has(h));
}

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** Today's calendar date in Sweden, whatever the visitor's own time zone. */
function swedishToday(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "8–15 december", "29 december – 5 januari" (year added only when the range crosses one). */
export function formatDeliveryRange(now: Date = new Date(), days: { min: number; max: number } = LONG_DELIVERY_DAYS): string {
  const today = swedishToday(now);
  const from = new Date(today.getTime() + days.min * 86_400_000);
  const to = new Date(today.getTime() + days.max * 86_400_000);
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  if (from.getUTCFullYear() !== to.getUTCFullYear()) {
    return `${day(from)} ${month(from)} ${from.getUTCFullYear()} – ${day(to)} ${month(to)} ${to.getUTCFullYear()}`;
  }
  if (from.getUTCMonth() === to.getUTCMonth()) return `${day(from)}–${day(to)} ${month(to)}`;
  return `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}
