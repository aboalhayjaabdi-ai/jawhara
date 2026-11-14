// Product recommendations for the cart drawer's carousel (components/cart/cart-recommendations.tsx).
// Built only from data the store already has -- the live "Valfritt Smycke" discount's get-items,
// the admin's own collection order (Alla smycken, Bästsäljare), the existing "related products"
// logic, and the visitor's own recently-viewed list (lib/recently-viewed.ts, localStorage only,
// sent by the client). No new tracking, cookies or external services.
//
// Which *kind* of recommendation to show is decided client-side from the cart's authoritative
// totals (promoProgress); this module only answers "which products for that kind".
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase/client";
import { getCollectionProductIds, getProductCardsByIds, getRelatedProductCards, type ProductCard } from "./queries";
import { interleaveNoelle } from "./campaign-products";

export type RecommendationMode = "gift" | "complete-3for2" | "bags-wallets" | "match-bag" | "viewed" | "mixed" | "curated";

export const RECOMMENDATION_MODES: RecommendationMode[] = ["gift", "complete-3for2", "bags-wallets", "match-bag", "viewed", "mixed", "curated"];

const MAX_PRODUCTS = 6;
// "Välj ett smycke till": 5 bracelets/necklaces (incl. at most one more of a design already in the
// cart), then one earring and one ring.
const COMPLETE_3FOR2_CATEGORIES = ["armband", "halsband", "orhangen", "ringar"] as const;
const COMPLETE_3FOR2_MAX = 8;
const JEWELRY_COLLECTION = "alla-smycken";
const BESTSELLER_COLLECTION = "bastsaljare-1";
const WALLET_COLLECTION = "tillbehor"; // "Plånböcker"
const BAG_COLLECTION = "vaskor-och-tillbehor"; // "Väskor"
const H_BAG_COLLECTION = "h-vaskor"; // "H väskor" -- suggested first once 3 för 2 is earned
// Top sellers across every category for "mixed": each category's own admin order (the
// "Rekommenderat" sort), picked round-robin so no single category dominates.
const MIXED_CATEGORY_COLLECTIONS = ["armband", "halsband", "vaskor-och-tillbehor", "ringar", "orhangen", "tillbehor"];

// The free-gift pool can be a whole collection (every piece of jewelry); the carousel only ever
// shows a handful, so only the first few in the store's own order are turned into cards.
const GIFT_POOL_MAX = 40;

/** Real "get" products of the live automatic buy-a-bag-get-a-free-gift promotion ("Valfritt
 * Smycke": a disjoint buy set and get set, 100 % off) -- whether the get side lists products or
 * collections -- ordered like the Alla smycken collection. Never a hardcoded list. */
async function getFreeGiftProductIds(): Promise<string[]> {
  const { data: discounts } = await supabase
    .from("discounts")
    .select("buy_item_type, buy_item_ids, get_item_type, get_item_ids")
    .eq("status", "active")
    .eq("kind", "automatic")
    .in("buy_item_type", ["product", "collection"])
    .in("get_item_type", ["product", "collection"])
    .eq("get_percentage", 100);
  const sorted = (ids: string[] | null) => JSON.stringify([...(ids ?? [])].sort());
  const gifts = (discounts ?? []).filter(
    (d) => !(d.buy_item_type === d.get_item_type && sorted(d.buy_item_ids as string[] | null) === sorted(d.get_item_ids as string[] | null))
  );
  const productShopifyIds = [...new Set(gifts.filter((d) => d.get_item_type === "product").flatMap((d) => (d.get_item_ids as string[] | null) ?? []))];
  const collectionShopifyIds = [...new Set(gifts.filter((d) => d.get_item_type === "collection").flatMap((d) => (d.get_item_ids as string[] | null) ?? []))];
  if (productShopifyIds.length === 0 && collectionShopifyIds.length === 0) return [];

  const [{ data: products }, { data: collections }, collectionOrder] = await Promise.all([
    productShopifyIds.length
      ? supabase.from("products").select("id").in("shopify_id", productShopifyIds).eq("status", "active")
      : Promise.resolve({ data: [] as { id: string }[] }),
    collectionShopifyIds.length
      ? supabase.from("collections").select("handle").in("shopify_id", collectionShopifyIds)
      : Promise.resolve({ data: [] as { handle: string }[] }),
    getCollectionProductIds(JEWELRY_COLLECTION),
  ]);
  const fromCollections = await Promise.all((collections ?? []).map((c) => getCollectionProductIds(c.handle as string)));
  const ids = [...new Set([...(products ?? []).map((p) => p.id as string), ...fromCollections.flat()])];
  const rank = new Map(collectionOrder.map((id, i) => [id, i]));
  return ids.sort((a, b) => (rank.get(a) ?? 1e6) - (rank.get(b) ?? 1e6)).slice(0, GIFT_POOL_MAX);
}

// The candidate pools don't depend on the visitor's cart, so they're cached across requests for
// 60s -- the same freshness the storefront pages themselves use (revalidate = 60) -- and only the
// cheap per-cart filtering below runs per request. Availability is re-checked by /api/cart/totals
// the moment anything is actually added.
const CACHE = { revalidate: 60 };
const cachedGiftCards = unstable_cache(async () => getProductCardsByIds(await getFreeGiftProductIds()), ["cart-recs-gifts"], CACHE);
const cachedJewelryIds = unstable_cache(() => getCollectionProductIds(JEWELRY_COLLECTION), ["cart-recs-jewelry-ids"], CACHE);
const cachedBestsellerIds = unstable_cache(() => getCollectionProductIds(BESTSELLER_COLLECTION), ["cart-recs-bestseller-ids"], CACHE);
const cachedBagIds = unstable_cache(() => getCollectionProductIds(BAG_COLLECTION), ["cart-recs-bag-ids"], CACHE);
const cachedWalletIds = unstable_cache(() => getCollectionProductIds(WALLET_COLLECTION), ["cart-recs-wallet-ids"], CACHE);
const cachedCategoryIds = unstable_cache((handle: string) => getCollectionProductIds(handle), ["cart-recs-category-ids"], CACHE);
const cachedCardsByIds = unstable_cache((ids: string[]) => getProductCardsByIds(ids), ["cart-recs-cards"], CACHE);
const cachedRelated = unstable_cache(
  (productId: string, handle: string, limit: number) => getRelatedProductCards(productId, handle, limit),
  ["cart-recs-related"],
  CACHE
);

async function productIdsByHandles(handles: string[]): Promise<{ id: string; handle: string }[]> {
  if (handles.length === 0) return [];
  const { data } = await supabase.from("products").select("id, handle").in("handle", handles).eq("status", "active");
  const byHandle = new Map((data ?? []).map((p) => [p.handle as string, p.id as string]));
  return handles.flatMap((h) => (byHandle.has(h) ? [{ id: byHandle.get(h)!, handle: h }] : []));
}

/** Keeps only products a customer can actually add right now: available, and not already fully in
 * the cart (a single-variant product already in the cart is dropped; a multi-variant one stays as
 * long as some available variant isn't in the cart -- the client then disables the in-cart ones). */
function addable(cards: ProductCard[], cartVariantIds: Set<string>): ProductCard[] {
  return cards.filter((c) => c.available && c.variants.some((v) => v.available && !cartVariantIds.has(v.id)));
}

function dedupe(cards: ProductCard[]): ProductCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export async function getCartRecommendations(input: {
  mode: RecommendationMode;
  cartProductIds: string[];
  cartVariantIds: string[];
  viewedHandles: string[];
}): Promise<ProductCard[]> {
  const cartProducts = new Set(input.cartProductIds);
  const cartVariants = new Set(input.cartVariantIds);
  const finish = (cards: ProductCard[]) => addable(dedupe(cards), cartVariants).slice(0, MAX_PRODUCTS);

  if (input.mode === "gift") {
    // The free gift (any piece of jewelry). Products already in the cart stay out (picking the
    // same piece twice isn't a new choice).
    return finish((await cachedGiftCards()).filter((c) => !cartProducts.has(c.id)));
  }

  if (input.mode === "bags-wallets") {
    // 3 för 2 is already earned -- suggest something other than more jewelry. H bags come first
    // (Noélle Väska and Noélle Väska Mini alternating, then the other H bags); after them, other
    // bags and wallets from the store's own Väskor / Plånböcker order, mixed (two bags, then a
    // wallet). Wallets are shown at their normal price here; the free gift (jewelry) is only ever
    // offered in "gift" mode.
    const [hBagIds, bagIds, walletIds] = await Promise.all([cachedCategoryIds(H_BAG_COLLECTION), cachedBagIds(), cachedWalletIds()]);
    const hBagSet = new Set(hBagIds);
    const hBags = interleaveNoelle((await cachedCardsByIds(hBagIds)).filter((c) => !cartProducts.has(c.id)));
    const bags = bagIds.filter((id) => !cartProducts.has(id) && !hBagSet.has(id)).slice(0, 8);
    const wallets = walletIds.filter((id) => !cartProducts.has(id)).slice(0, 4);
    const mixed: string[] = [];
    while (bags.length || wallets.length) {
      mixed.push(...bags.splice(0, 2), ...wallets.splice(0, 1));
    }
    return finish([...hBags, ...(await cachedCardsByIds(mixed))]);
  }

  // Bestsellers from every category, mixed -- used directly ("mixed") and as the fallback when a
  // visitor's viewing history is too thin for "viewed".
  async function mixedBestsellers(): Promise<ProductCard[]> {
    const categories = await Promise.all(MIXED_CATEGORY_COLLECTIONS.map((h) => cachedCategoryIds(h)));
    const queues = categories.map((ids) => ids.filter((id) => !cartProducts.has(id)).slice(0, 4));
    const mixed: string[] = [];
    for (let round = 0; round < 4; round++) for (const q of queues) if (q[round]) mixed.push(q[round]);
    return cachedCardsByIds([...new Set(mixed)].slice(0, 24));
  }

  if (input.mode === "mixed") return finish(await mixedBestsellers());

  const [jewelryIds, bestsellerIds] = await Promise.all([cachedJewelryIds(), cachedBestsellerIds()]);
  const jewelrySet = new Set(jewelryIds);
  const topJewelry = jewelryIds.slice(0, 24);

  if (input.mode === "complete-3for2") {
    // Variety over repetition: bracelets and necklaces alternating (each category's own admin
    // order), every suggestion a different design (title), and designs already in the cart left
    // out -- except at most ONE more of a design the customer already picked, a few places in.
    // Earrings and rings come last (one each). Only products that count towards "3 för 2".
    const [cartCards, ...categoryIds] = await Promise.all([
      cachedCardsByIds(input.cartProductIds.slice(0, 20)),
      ...COMPLETE_3FOR2_CATEGORIES.map((h) => cachedCategoryIds(h)),
    ]);
    const [armband, halsband, orhangen, ringar] = await Promise.all(
      categoryIds.map(async (ids) =>
        (await cachedCardsByIds(ids.filter((id) => !cartProducts.has(id)).slice(0, 30))).filter((c) => c.threeForTwo && addable([c], cartVariants).length > 0)
      )
    );
    const titleKey = (t: string) => t.trim().toLowerCase();
    const cartTitles = new Set(cartCards.map((c) => titleKey(c.title)));
    const usedIds = new Set<string>();
    const usedTitles = new Set<string>();
    const nextNew = (list: ProductCard[]) => {
      const c = list.find((p) => !usedIds.has(p.id) && !usedTitles.has(titleKey(p.title)) && !cartTitles.has(titleKey(p.title)));
      if (c) {
        usedIds.add(c.id);
        usedTitles.add(titleKey(c.title));
      }
      return c;
    };
    const picks: ProductCard[] = [];
    for (let round = 0; picks.length < 5 && round < 10; round++) {
      for (const list of [armband, halsband]) {
        const c = nextNew(list);
        if (c && picks.length < 5) picks.push(c);
      }
    }
    // One more of a design already in the cart (another color/size), as the 4th suggestion.
    const sameDesign = [...armband, ...halsband, ...orhangen, ...ringar].find((p) => !usedIds.has(p.id) && cartTitles.has(titleKey(p.title)));
    if (sameDesign) picks.splice(Math.min(3, picks.length), 0, sameDesign);
    for (const list of [orhangen, ringar]) {
      const c = nextNew(list);
      if (c) picks.push(c);
    }
    return addable(dedupe(picks), cartVariants).slice(0, COMPLETE_3FOR2_MAX);
  }

  if (input.mode === "match-bag") {
    const ids = [...new Set([...bestsellerIds.filter((id) => jewelrySet.has(id)), ...topJewelry])].slice(0, 24);
    return finish((await cachedCardsByIds(ids)).filter((c) => !cartProducts.has(c.id)));
  }

  if (input.mode === "viewed") {
    // What the visitor actually looked at (most recent first), then products related to those.
    const viewed = (await productIdsByHandles(input.viewedHandles.slice(0, 4))).filter((p) => !cartProducts.has(p.id));
    const [relatedLists, viewedCards] = await Promise.all([
      Promise.all(viewed.slice(0, 2).map((p) => cachedRelated(p.id, p.handle, 6))),
      cachedCardsByIds(viewed.map((p) => p.id)),
    ]);
    const related = relatedLists.flat();
    const viewedIds = new Set(viewed.map((p) => p.id));
    const cards = [...viewedCards, ...related.filter((c) => !viewedIds.has(c.id))].filter((c) => !cartProducts.has(c.id));
    if (cards.length >= 2) return finish(cards);
    // Too little history -> bestsellers from every category instead.
    return finish(await mixedBestsellers());
  }

  // "curated": the store's own bestsellers, then its jewelry order.
  const ids = [...new Set([...bestsellerIds, ...topJewelry])].slice(0, 24);
  return finish((await cachedCardsByIds(ids)).filter((c) => !cartProducts.has(c.id)));
}

/** Every mode's products for one cart, in a single request -- the cart can then fetch these in
 * parallel with its totals (instead of waiting for totals to pick a mode first) and switch modes
 * instantly as the cart changes. All pools are cached, so this costs little more than one mode. */
export async function getCartRecommendationBundle(input: Omit<Parameters<typeof getCartRecommendations>[0], "mode">) {
  const entries = await Promise.all(
    RECOMMENDATION_MODES.map(async (mode) => [mode, await getCartRecommendations({ ...input, mode }).catch(() => [])] as const)
  );
  return Object.fromEntries(entries) as Record<RecommendationMode, ProductCard[]>;
}
