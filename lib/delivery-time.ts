/**
 * "Beräknad leverans" line on every product page (components/product/product-detail.tsx, just
 * under the "I lager" status): a date range in Swedish working days from today -- 10–18 for bags
 * with the longer delivery time, 8–14 for everything else.
 *
 * Which products count as longer delivery is decided purely from their collection membership on
 * the website (Supabase collection_products), the same rule the earlier "Leveranstid: 3–4 veckor"
 * box used:
 *   - "H väskor" (handle h-vaskor) and Noélle Mini (noelle-mini-vaskor) always win: regular
 *     delivery time, no line -- even though they are also in "Väskor".
 *   - Every other product in "Väskor" (vaskor-och-tillbehor) or one of its sub-categories (LV, GG,
 *     DI, YSL, CC, MIU, JACQ), and every gift set, is longer delivery.
 *   - Everything else (jewelry, wallets, H bags, ...) is regular delivery.
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

/** Delivery windows in Swedish working days (Mon–Fri, not public holidays) from today. */
export const DELIVERY_WORKING_DAYS = {
  long: { min: 10, max: 18 },
  regular: { min: 8, max: 14 },
} as const;
export type DeliveryKind = keyof typeof DELIVERY_WORKING_DAYS;

export function hasLongDelivery(collectionHandles: readonly string[]): boolean {
  if (collectionHandles.some((h) => REGULAR_DELIVERY_COLLECTION_HANDLES.has(h))) return false;
  return collectionHandles.some((h) => LONG_DELIVERY_COLLECTION_HANDLES.has(h));
}

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const DAY_MS = 86_400_000;

/** Today's calendar date in Sweden (as a UTC-midnight Date), whatever the visitor's own time zone. */
function swedishToday(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Easter Sunday (Gregorian, anonymous algorithm) as a UTC-midnight Date. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<number>>();
/** Swedish weekday holidays plus the de facto days off (julafton, nyårsafton, midsommarafton). */
function swedishHolidays(year: number): Set<number> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year).getTime();
  const fixed = (month: number, day: number) => Date.UTC(year, month - 1, day);
  // Midsommarafton: the Friday between 19 and 25 June.
  let midsummerEve = fixed(6, 19);
  while (new Date(midsummerEve).getUTCDay() !== 5) midsummerEve += DAY_MS;
  const days = new Set<number>([
    fixed(1, 1), // nyårsdagen
    fixed(1, 6), // trettondedag jul
    easter - 2 * DAY_MS, // långfredagen
    easter + DAY_MS, // annandag påsk
    fixed(5, 1), // första maj
    easter + 39 * DAY_MS, // Kristi himmelsfärdsdag
    fixed(6, 6), // nationaldagen
    midsummerEve,
    fixed(12, 24), // julafton
    fixed(12, 25), // juldagen
    fixed(12, 26), // annandag jul
    fixed(12, 31), // nyårsafton
  ]);
  holidayCache.set(year, days);
  return days;
}

function isWorkingDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !swedishHolidays(date.getUTCFullYear()).has(date.getTime());
}

/** The date `count` working days after `from` (from itself not counted). */
function addWorkingDays(from: Date, count: number): Date {
  let date = from;
  let left = count;
  while (left > 0) {
    date = new Date(date.getTime() + DAY_MS);
    if (isWorkingDay(date)) left--;
  }
  return date;
}

/** "8–15 december", "29 december – 5 januari" (year added only when the range crosses one). */
export function formatDeliveryRange(kind: DeliveryKind, now: Date = new Date()): string {
  const today = swedishToday(now);
  const { min, max } = DELIVERY_WORKING_DAYS[kind];
  const from = addWorkingDays(today, min);
  const to = addWorkingDays(today, max);
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  if (from.getUTCFullYear() !== to.getUTCFullYear()) {
    return `${day(from)} ${month(from)} ${from.getUTCFullYear()} – ${day(to)} ${month(to)} ${to.getUTCFullYear()}`;
  }
  if (from.getUTCMonth() === to.getUTCMonth()) return `${day(from)}–${day(to)} ${month(to)}`;
  return `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}
