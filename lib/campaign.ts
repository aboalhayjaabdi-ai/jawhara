/**
 * Black Month campaign -- the ONE place campaign-specific copy and switches live.
 *
 * Turning the campaign off later:
 *   1. Set `BLACK_MONTH.active` to false. That alone:
 *      - restores the "Rea" label on product cards and product pages,
 *      - restores the previous announcement-bar messages,
 *      - removes the "3 för 2" info box and the bag campaign-price line on product pages,
 *      - makes /black-month return 404 (and drops it from the sitemap).
 *   2. In Jawhara admin: remove the "BLACK MONTH" item under Butik -> Menyer, and hide/remove the
 *      Black Month section under Butik -> Startsida (both are admin-editable data, not code).
 *   The Shopify/Supabase "Black Month" collection is left in place until removed manually.
 *
 * Every claim here was verified against the live store when written (2026-11-07):
 *   - "3 för 2": active automatic Shopify discount (buy 2, get 1 at 100 % off, lowest-priced item)
 *     scoped to the jewelry collections; the Jawhara cart drawer applies it automatically via
 *     lib/discounts.ts and Shopify checkout applies it automatically too.
 *   - Free shipping: Shopify delivery profile charges 0 kr for Sweden (and the EU) with no minimum
 *     order value; international zone is 299 kr -- hence "inom Sverige" in the copy below.
 * No countdowns, invented discounts or stock/sales claims anywhere.
 */
export const BLACK_MONTH = {
  active: true,
  name: "Black Month",
  path: "/black-month",
  collectionHandle: "black-month",

  /** Product-card / product-page label for products with a compare-at price (replaces "Rea"). */
  saleLabel: "Black Month",

  announcements: ["BLACK MONTH – UPPTÄCK VÅRA ERBJUDANDEN", "3 FÖR 2 PÅ ALLA SMYCKEN", "FRI FRAKT PÅ ALLA BESTÄLLNINGAR INOM SVERIGE"],

  threeForTwo: {
    heading: "3 FÖR 2 PÅ ALLA SMYCKEN",
    pdpHeading: "BLACK MONTH – 3 FÖR 2",
    body: "Köp 3 smycken och få det billigaste på köpet.",
    pdpBody: "Köp 3 smycken och få det billigaste på köpet. Rabatten dras automatiskt i varukorgen.",
  },

  /** Short line under the price on bag product pages (only shown when the product has a compare-at price). */
  bagPriceNote: "Black Month-pris · Fri frakt inom Sverige",
  /** products.template_suffix values that identify a bag product page. */
  bagTemplateKeys: ["vaskor", "erbjudande-vaskor", "gift-sets"],

  page: {
    title: "BLACK MONTH",
    subtitle: "Smycken och väskor till kampanjpriser – och 3 för 2 på alla smycken.",
    seoTitle: "Black Month – smycken och väskor till kampanjpris",
    seoDescription: "Upptäck Jawharas Black Month: 3 för 2 på alla smycken, smycken och väskor till kampanjpriser och fri frakt inom Sverige.",
    /** Order on the page: jewelry first, bags second (see app/(storefront)/black-month/page.tsx). */
    jewelryOffers: {
      heading: "Smycken till kampanjpris",
      intro: "Armband, halsband, örhängen och ringar – nu till Black Month-pris. Köp 3 och få det billigaste på köpet.",
      collectionHandle: "alla-smycken",
      limit: 12,
      buttonText: "Se alla smycken",
    },
    /** H bags, Noélle Väska and Noélle Väska Mini first. */
    hBagOffers: {
      heading: "Noélle-väskor till kampanjpris",
      intro: "Noélle och Noélle Mini – tidlösa favoriter, nu till Black Month-pris.",
      limit: 8,
      buttonText: "Se alla H väskor",
      buttonHref: "/collections/h-vaskor",
    },
    moreJewelry: { heading: "Fler smycken att älska", collectionHandle: "alla-smycken", limit: 12, buttonText: "Visa fler smycken" },
    /** The Black Month collection's other bags, as a compact carousel further down. */
    bagOffers: {
      heading: "Fler väskor till kampanjpris",
      limit: 8,
      buttonText: "Shoppa alla väskor",
      buttonHref: "/collections/vaskor-och-tillbehor",
    },
    categories: {
      heading: "Shoppa efter kategori",
      handles: ["armband", "halsband", "orhangen", "ringar", "vaskor-och-tillbehor", "gift-sets"],
    },
  },
} as const;

/** Label for the "has a compare-at price" badge -- "Black Month" during the campaign, "Rea" otherwise. */
export const SALE_LABEL: string = BLACK_MONTH.active ? BLACK_MONTH.saleLabel : "Rea";

/** Announcement-bar messages used when the campaign is off (the bar's previous content). */
export const DEFAULT_ANNOUNCEMENTS = ["3 FÖR 2 PÅ ALLA SMYCKEN!", "KÖP EN VÄSKA - FÅ EN PLÅNBOK", "FRI FRAKT!", "60 DAGARS GARANTI!"];

export const ANNOUNCEMENTS: readonly string[] = BLACK_MONTH.active ? BLACK_MONTH.announcements : DEFAULT_ANNOUNCEMENTS;
