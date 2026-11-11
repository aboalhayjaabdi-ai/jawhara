import { BLACK_MONTH } from "@/lib/campaign";
import { getPrioritizedHBags, hBagPriority, interleaveNoelle, resolveMixedJewelry } from "@/lib/campaign-products";
import type { HomeSection, ProductCard } from "@/lib/queries";

if (typeof window !== "undefined") {
  throw new Error("lib/campaign-homepage.ts must never be imported into client code");
}

/**
 * Black Month layer on top of the admin's published homepage (app/(storefront)/page.tsx).
 * Applied ONLY while BLACK_MONTH.active -- turning the campaign off restores the admin layout
 * exactly as saved in Jawhara admin -> Butik -> Startsida (nothing in the database is changed).
 *
 * Jewelry first, bags second, and where bags show the H bags lead (Noélle Väska, then Noélle
 * Väska Mini):
 *    1. Banner + rullande text        (admin's own; "3 FÖR 2 PÅ ALLA SMYCKEN" added to the text)
 *    2. Black Month – våra bästa erbjudanden: jewelry from every category mixed with Noélle bags
 *    3. 3 för 2 på alla smycken        (replaces "Smycken att älska"; mixed jewelry categories)
 *    4. Shoppa efter kategori          (jewelry categories first)
 *    5. Noélle-väskor                  (replaces "Noelle mini väskor"; H bags, Noélle first)
 *    6. The admin's jewelry sections, then its remaining sections (bags last)
 * "Upptäck våra väskor", "Nyheter" and "Alla produkter" are hidden (they repeated bags), the
 * admin's own Black Month bag list is replaced by section 2, and every product list skips products
 * already shown above it.
 */

const THREE_FOR_TWO_MARQUEE = "3 FÖR 2 PÅ ALLA SMYCKEN";
const HIDDEN_HEADINGS = new Set(["upptäck våra väskor", "nyheter", "alla produkter"]);
const BM_SECTION_ID = "campaign-black-month";
const NOELLE_SECTION_ID = "campaign-noelle";
const JEWELRY_SECTION_ID = "campaign-three-for-two";

/** Display order for the admin's own sections (lower = higher up); unlisted ones keep their order after these. */
const ORDER: [(h: string, s: HomeSection) => boolean, number][] = [
  [(h) => h === "h armband", 60],
  [(h) => h === "klöver armband", 70],
  [(h, s) => s.type === "hero" && h.startsWith("maximal glans"), 80],
  [(h) => h === "alla örhängen", 90],
  [(h) => h === "guld halsband", 100],
  [(h) => h.startsWith("smycken som du faktiskt gillar"), 110],
  [(h) => h === "våra bästsäljare", 120],
  [(h) => h === "gift sets", 140],
  [(h, s) => s.type === "hero" && h.startsWith("premiummaterial"), 150],
];

const headingOf = (s: HomeSection) => {
  const c = s.config as any;
  return String(c?.heading ?? c?.text ?? c?.topText ?? "").trim().toLowerCase();
};

export async function applyBlackMonthHomepage(
  sections: HomeSection[]
): Promise<{ sections: HomeSection[]; presetProducts: Map<string, ProductCard[]> }> {
  if (!BLACK_MONTH.active) return { sections, presetProducts: new Map() };

  // --- Products for the campaign sections (resolved in page order, nothing repeats) ---
  const [bmJewelry, hBags] = await Promise.all([resolveMixedJewelry(4), getPrioritizedHBags()]);
  const noelle = hBags.filter((p) => hBagPriority(p.title) === 0).slice(0, 2);
  const noelleMini = hBags.filter((p) => hBagPriority(p.title) === 1).slice(0, 2);
  // Mixed so each row on mobile pairs a piece of jewelry with a bag.
  const bmProducts = [bmJewelry[0], noelle[0], bmJewelry[1], noelleMini[0], bmJewelry[2], noelle[1], bmJewelry[3], noelleMini[1]].filter(
    (p): p is ProductCard => Boolean(p)
  );
  const shown = new Set(bmProducts.map((p) => p.id));
  const jewelry = await resolveMixedJewelry(8, shown);
  for (const p of jewelry) shown.add(p.id);
  const hBagSection = interleaveNoelle(hBags.filter((p) => !shown.has(p.id))).slice(0, 8);

  const bmSection: HomeSection = {
    id: BM_SECTION_ID,
    type: "product_list",
    visible: true,
    config: {
      heading: "Black Month – våra bästa erbjudanden",
      intro: "3 för 2 på alla smycken och våra Noélle-väskor till kampanjpris.",
      collectionHandle: BLACK_MONTH.collectionHandle,
      style: "campaign",
      layout: "grid",
      limit: 8,
      buttonText: "Se alla erbjudanden",
      buttonHref: BLACK_MONTH.path,
    },
  };
  const jewelrySection: HomeSection = {
    id: JEWELRY_SECTION_ID,
    type: "product_list",
    visible: true,
    config: {
      heading: "3 för 2 på alla smycken",
      intro: "Köp 3 smycken och få det billigaste på köpet. Rabatten dras automatiskt i varukorgen.",
      collectionHandle: "alla-smycken",
      style: "campaign",
      layout: "grid",
      limit: 8,
      buttonText: "Shoppa smycken",
      buttonHref: "/collections/alla-smycken",
    },
  };
  const noelleSection: HomeSection = {
    id: NOELLE_SECTION_ID,
    type: "product_list",
    visible: true,
    config: { heading: "Noélle-väskor", collectionHandle: "h-vaskor", limit: 8, buttonText: "Se alla H väskor", buttonHref: "/collections/h-vaskor" },
  };

  // --- Reorder / adjust the admin's own sections ---
  const top: HomeSection[] = [];
  const ranked: { s: HomeSection; k: number; i: number }[] = [];
  let firstHeroTaken = false;
  sections.forEach((s, i) => {
    const h = headingOf(s);
    if (!s.visible) return ranked.push({ s, k: 10_000 + i, i });
    if (s.type === "hero" && !firstHeroTaken && !ORDER.some(([m]) => m(h, s))) {
      firstHeroTaken = true;
      return top.push(s);
    }
    if (s.type === "marquee") {
      const items = Array.isArray((s.config as any).items) ? ((s.config as any).items as string[]) : [];
      const next = items.includes(THREE_FOR_TWO_MARQUEE) ? items : [THREE_FOR_TWO_MARQUEE, ...items];
      return top.push({ ...s, config: { ...s.config, items: next } });
    }
    // Replaced by the campaign sections above.
    if (s.type === "product_list" && (/^black month.*erbjudanden$/.test(h) || h === "smycken att älska" || h === "noelle mini väskor")) return;
    if (HIDDEN_HEADINGS.has(h)) return;
    if (s.type === "collection_links" && h === "shoppa efter kategori") {
      return top.push({ ...s, config: { ...s.config, handles: ["armband", "halsband", "orhangen", "ringar", "vaskor-och-tillbehor", "gift-sets"] } });
    }
    const k = ORDER.find(([m]) => m(h, s))?.[1] ?? 500 + i;
    const next = s.type === "product_list" ? { ...s, config: { ...s.config, unique: true, ...(h === "våra bästsäljare" ? { heading: "Bästsäljande väskor" } : {}) } } : s;
    ranked.push({ s: next, k, i });
  });

  // top = [hero, marquee, categories] in admin order; campaign sections slot in after the marquee.
  const hero = top.filter((s) => s.type === "hero");
  const marquee = top.filter((s) => s.type === "marquee");
  const categories = top.filter((s) => s.type === "collection_links");
  const rest = ranked.sort((a, b) => a.k - b.k || a.i - b.i).map((r) => r.s);

  return {
    sections: [...hero, ...marquee, bmSection, jewelrySection, ...categories, noelleSection, ...rest],
    presetProducts: new Map([
      [BM_SECTION_ID, bmProducts],
      [JEWELRY_SECTION_ID, jewelry],
      [NOELLE_SECTION_ID, hBagSection],
    ]),
  };
}
