import { resolveProductList } from "@/lib/product-sections";
import { getCollectionProductCards, type ProductCard } from "@/lib/queries";

if (typeof window !== "undefined") {
  throw new Error("lib/campaign-products.ts must never be imported into client code");
}

/**
 * Product picks shared by the Black Month page and the homepage's Black Month layout
 * (lib/campaign-homepage.ts): jewelry from every jewelry category, and H bags with the Noélle
 * models first. Server-only (uses the service-client sales ranking via lib/product-sections.ts).
 */

export const JEWELRY_CATEGORY_HANDLES = ["armband", "halsband", "orhangen", "ringar"] as const;

const onSale = (p: ProductCard) => p.compareAtPrice != null && p.compareAtPrice > p.price;

/** One category's jewelry, best pick first: real best-sellers (last 90 days) then the collection's
 * own order; available and Black Month-priced pieces ahead of the rest. */
async function rankedCategory(handle: string, depth: number, exclude: ReadonlySet<string>): Promise<ProductCard[]> {
  const [bestSelling, manual] = await Promise.all([
    resolveProductList({ collectionHandle: handle, limit: depth, sort: "best-selling" }),
    resolveProductList({ collectionHandle: handle, limit: depth * 2 }),
  ]);
  const seen = new Set<string>();
  const pool = [...bestSelling, ...manual].filter((p) => p.available && !exclude.has(p.id) && !seen.has(p.id) && seen.add(p.id));
  return [...pool.filter(onSale), ...pool.filter((p) => !onSale(p))];
}

/** Up to `limit` jewelry pieces mixed across armband, halsband, örhängen and ringar (one from each
 * in turn), skipping anything in `exclude`. */
export async function resolveMixedJewelry(limit: number, exclude: ReadonlySet<string> = new Set()): Promise<ProductCard[]> {
  const depth = Math.max(8, Math.ceil(limit / JEWELRY_CATEGORY_HANDLES.length) + exclude.size);
  const perCategory = await Promise.all(JEWELRY_CATEGORY_HANDLES.map((h) => rankedCategory(h, depth, exclude)));
  const out: ProductCard[] = [];
  const used = new Set<string>();
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const list of perCategory) {
      const p = list[round];
      if (!p || used.has(p.id)) continue;
      used.add(p.id);
      out.push(p);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added && perCategory.every((l) => round >= l.length)) break;
  }
  return out;
}

const normalizeTitle = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** 0 = Noélle Väska, 1 = Noélle Väska Mini, 2 = any other H bag. */
export function hBagPriority(title: string): 0 | 1 | 2 {
  const t = normalizeTitle(title);
  if (t.startsWith("noelle vaska mini")) return 1;
  if (t.startsWith("noelle vaska")) return 0;
  return 2;
}

/** Every available H bag ("H väskor"), Noélle Väska first, then Noélle Väska Mini, then the other H
 * bags -- each group in the collection's own order. */
export async function getPrioritizedHBags(exclude: ReadonlySet<string> = new Set()): Promise<ProductCard[]> {
  const cards = (await getCollectionProductCards("h-vaskor", 200)).filter((p) => p.available && !exclude.has(p.id));
  return cards.map((p, i) => ({ p, i })).sort((a, b) => hBagPriority(a.p.title) - hBagPriority(b.p.title) || a.i - b.i).map(({ p }) => p);
}

/** H bags ordered for display: Noélle Väska and Noélle Väska Mini alternating, then the other H bags. */
export function interleaveNoelle(hBags: ProductCard[]): ProductCard[] {
  const noelle = hBags.filter((p) => hBagPriority(p.title) === 0);
  const mini = hBags.filter((p) => hBagPriority(p.title) === 1);
  const other = hBags.filter((p) => hBagPriority(p.title) === 2);
  const mixed = Array.from({ length: Math.max(noelle.length, mini.length) }, (_, i) => [noelle[i], mini[i]]).flat();
  return [...mixed, ...other].filter((p): p is ProductCard => Boolean(p));
}
