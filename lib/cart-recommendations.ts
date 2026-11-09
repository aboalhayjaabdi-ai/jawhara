// Product recommendations for the cart drawer's carousel (components/cart/cart-recommendations.tsx).
// Built only from data the store already has -- the live "Valfri Plånbok" discount's get-items,
// the admin's own collection order (Alla smycken, Bästsäljare), the existing "related products"
// logic, and the visitor's own recently-viewed list (lib/recently-viewed.ts, localStorage only,
// sent by the client). No new tracking, cookies or external services.
//
// Which *kind* of recommendation to show is decided client-side from the cart's authoritative
// totals (promoProgress); this module only answers "which products for that kind".
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase/client";
import { getCollectionProductIds, getProductCardsByIds, getRelatedProductCards, type ProductCard } from "./queries";

export type RecommendationMode = "wallet" | "complete-3for2" | "match-bag" | "viewed" | "curated";

export const RECOMMENDATION_MODES: RecommendationMode[] = ["wallet", "complete-3for2", "match-bag", "viewed", "curated"];

const MAX_PRODUCTS = 6;
const JEWELRY_COLLECTION = "alla-smycken";
const BESTSELLER_COLLECTION = "bastsaljare-1";
const WALLET_COLLECTION = "tillbehor"; // "Plånböcker" -- used only for ordering the free wallets

/** Real "get" products of the live automatic buy-a-bag-get-a-wallet promotion (disjoint buy/get
 * product lists), ordered like the Plånböcker collection. Never a hardcoded list. */
async function getFreeWalletProductIds(): Promise<string[]> {
  const { data: discounts } = await supabase
    .from("discounts")
    .select("buy_item_ids, get_item_ids")
    .eq("status", "active")
    .eq("kind", "automatic")
    .eq("buy_item_type", "product")
    .eq("get_item_type", "product")
    .eq("get_percentage", 100);
  const shopifyIds = [...new Set((discounts ?? []).flatMap((d) => (d.get_item_ids as string[] | null) ?? []))];
  if (shopifyIds.length === 0) return [];
  const [{ data: products }, collectionOrder] = await Promise.all([
    supabase.from("products").select("id, shopify_id").in("shopify_id", shopifyIds).eq("status", "active"),
    getCollectionProductIds(WALLET_COLLECTION),
  ]);
  const ids = (products ?? []).map((p) => p.id as string);
  const rank = new Map(collectionOrder.map((id, i) => [id, i]));
  return ids.sort((a, b) => (rank.get(a) ?? 1e6) - (rank.get(b) ?? 1e6));
}

// The candidate pools don't depend on the visitor's cart, so they're cached across requests for
// 60s -- the same freshness the storefront pages themselves use (revalidate = 60) -- and only the
// cheap per-cart filtering below runs per request. Availability is re-checked by /api/cart/totals
// the moment anything is actually added.
const CACHE = { revalidate: 60 };
const cachedWalletCards = unstable_cache(async () => getProductCardsByIds(await getFreeWalletProductIds()), ["cart-recs-wallets"], CACHE);
const cachedJewelryIds = unstable_cache(() => getCollectionProductIds(JEWELRY_COLLECTION), ["cart-recs-jewelry-ids"], CACHE);
const cachedBestsellerIds = unstable_cache(() => getCollectionProductIds(BESTSELLER_COLLECTION), ["cart-recs-bestseller-ids"], CACHE);
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

  if (input.mode === "wallet") {
    // Wallets already in the cart stay out (picking the same wallet twice isn't a new choice).
    return finish((await cachedWalletCards()).filter((c) => !cartProducts.has(c.id)));
  }

  const [jewelryIds, bestsellerIds] = await Promise.all([cachedJewelryIds(), cachedBestsellerIds()]);
  const jewelrySet = new Set(jewelryIds);
  const topJewelry = jewelryIds.slice(0, 24);

  if (input.mode === "complete-3for2") {
    // Most relevant first: the same specific category as a piece already in the cart (e.g. more
    // gold bracelets next to a gold bracelet), then the store's own jewelry order. Only products
    // that actually count towards "3 för 2" are kept.
    const anchor = input.cartProductIds.find((id) => jewelrySet.has(id));
    const [related, fallback] = await Promise.all([anchor ? cachedRelated(anchor, "", 10) : Promise.resolve([]), cachedCardsByIds(topJewelry)]);
    return finish([...related, ...fallback].filter((c) => c.threeForTwo && !cartProducts.has(c.id)));
  }

  if (input.mode === "match-bag") {
    const ids = [...new Set([...bestsellerIds.filter((id) => jewelrySet.has(id)), ...topJewelry])].slice(0, 24);
    return finish((await cachedCardsByIds(ids)).filter((c) => !cartProducts.has(c.id)));
  }

  if (input.mode === "viewed") {
    // Related to what the visitor actually looked at (most recent first), then those viewed
    // products themselves.
    const viewed = (await productIdsByHandles(input.viewedHandles.slice(0, 4))).filter((p) => !cartProducts.has(p.id));
    const [relatedLists, viewedCards] = await Promise.all([
      Promise.all(viewed.slice(0, 2).map((p) => cachedRelated(p.id, p.handle, 6))),
      cachedCardsByIds(viewed.map((p) => p.id)),
    ]);
    const related = relatedLists.flat();
    const viewedIds = new Set(viewed.map((p) => p.id));
    const cards = [...related.filter((c) => !viewedIds.has(c.id)), ...viewedCards].filter((c) => !cartProducts.has(c.id));
    if (cards.length >= 2) return finish(cards);
    // Too little history -> fall through to curated picks below.
  }

  // "curated": the store's own bestsellers, then its jewelry order.
  const ids = [...new Set([...bestsellerIds, ...topJewelry])].slice(0, 24);
  return finish((await cachedCardsByIds(ids)).filter((c) => !cartProducts.has(c.id)));
}
