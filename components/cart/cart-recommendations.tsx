"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CheckoutTotals } from "@/lib/discounts";
import type { ProductCard } from "@/lib/queries";
import type { RecommendationMode } from "@/lib/cart-recommendations";
import { getRecentlyViewed } from "@/lib/recently-viewed";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { useCartActions, type CartItem } from "./cart-provider";
import { findPromos, walletStatus } from "./cart-offers";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

const HEADINGS: Record<RecommendationMode, string> = {
  wallet: "Välj din gratis plånbok 🎁",
  "complete-3for2": "Komplettera ditt 3 för 2!",
  "bags-wallets": "Utvalt för dig",
  "match-bag": "Matcha din väska med dessa favoriter",
  viewed: "Du kanske också gillar",
  mixed: "Utvalt för dig",
  curated: "Utvalt för dig",
};

/** Priority order from the cart's own authoritative promotion status (lib/discounts.ts
 * promoProgress): an unclaimed free wallet first; with both bags and jewelry in the cart, the
 * visitor's own browsing or mixed bestsellers; then, with 1-2 jewelry pieces, more jewelry to
 * reach 3 för 2; once 3 för 2 is earned, bags and wallets instead of more jewelry; jewelry to go
 * with a bag; then the visitor's own browsing; then the store's curated picks. */
function pickMode(totals: CheckoutTotals, viewedCount: number): RecommendationMode {
  const { jewelry, wallet } = findPromos(totals);
  const walletInfo = walletStatus(wallet);
  if (walletInfo?.needsChoice) return "wallet";
  // Bag(s) AND jewelry in the cart (free wallet already chosen): what they've been looking at,
  // or -- without any history -- bestsellers mixed from every category.
  if (walletInfo && jewelry && jewelry.buyUnits > 0) return viewedCount >= 1 ? "viewed" : "mixed";
  if (jewelry && jewelry.freeUnits === 0 && jewelry.buyUnits > 0 && jewelry.buyUnits < jewelry.buyQuantity + jewelry.getQuantity) {
    return "complete-3for2";
  }
  if (jewelry && jewelry.freeUnits > 0) return "bags-wallets";
  if (walletInfo) return "match-bag";
  if (viewedCount >= 2) return "viewed";
  return "curated";
}

export function CartRecommendations({ items, totals }: { items: CartItem[]; totals: CheckoutTotals | null }) {
  const { addItem } = useCartActions();
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [shownMode, setShownMode] = useState<RecommendationMode | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const cartVariantIds = useMemo(() => new Set(items.map((i) => i.variantId)), [items]);
  const cartProductIds = useMemo(() => [...new Set(items.map((i) => i.productId).filter(Boolean))], [items]);

  // Recently viewed handles (the existing localStorage list -- no new tracking), excluding what's
  // already in the cart.
  const viewedHandles = useMemo(() => {
    const inCart = new Set(items.map((i) => i.productHandle));
    return getRecentlyViewed()
      .map((p) => p.handle)
      .filter((h) => !inCart.has(h));
  }, [items]);

  // Mode only changes once fresh totals arrive -- while a totals refetch is in flight the previous
  // mode (and products) stay on screen instead of flickering.
  const mode = totals ? pickMode(totals, viewedHandles.length) : shownMode;
  const requestKey = mode ? JSON.stringify([mode, [...cartVariantIds].sort(), mode === "viewed" ? viewedHandles : []]) : null;

  useEffect(() => {
    if (!mode || !requestKey || items.length === 0) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, cartProductIds, cartVariantIds: [...cartVariantIds], viewedHandles }),
        });
        const data = await res.json();
        if (cancelled) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setShownMode(mode);
        setPickerFor(null);
        scrollerRef.current?.scrollTo({ left: 0 });
      } catch {
        // Recommendations are optional -- keep whatever is on screen.
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // requestKey captures every input that matters (mode, cart variants, viewed history).
  }, [requestKey]);

  if (items.length === 0 || !shownMode || products.length === 0) return null;
  const isWallet = shownMode === "wallet";

  function add(product: ProductCard, variantId: string) {
    const v = product.variants.find((x) => x.id === variantId);
    if (!v) return;
    const label = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ");
    // The same addItem every other add-to-cart uses -- for a free wallet that IS the store's
    // existing "valfri plånbok" mechanism: the live automatic discount makes it free, both in
    // /api/cart/totals and in Shopify's checkout.
    addItem({
      productId: product.id,
      variantId: v.id,
      productHandle: product.handle,
      title: product.title,
      variantTitle: normalizeVariantTitle(product.quickAddVariantId ? "Default Title" : label) ?? "",
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      image: v.image ?? product.image,
    });
    setPickerFor(null);
    setJustAddedId(product.id);
    window.setTimeout(() => setJustAddedId((id) => (id === product.id ? null : id)), 1400);
  }

  function scrollBy(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <section aria-label={HEADINGS[shownMode]} className="pt-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em]">{HEADINGS[shownMode]}</h3>
        <div className="hidden gap-1.5 [@media(hover:hover)]:flex">
          <button type="button" aria-label="Föregående" onClick={() => scrollBy(-1)} className="btn-fx flex h-7 w-7 items-center justify-center border border-line text-sm">
            ‹
          </button>
          <button type="button" aria-label="Nästa" onClick={() => scrollBy(1)} className="btn-fx flex h-7 w-7 items-center justify-center border border-line text-sm">
            ›
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto scroll-smooth px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => {
          const addableVariants = p.variants.filter((v) => v.available && !cartVariantIds.has(v.id));
          const singleVariantId = p.quickAddVariantId && addableVariants.some((v) => v.id === p.quickAddVariantId) ? p.quickAddVariantId : null;
          const added = justAddedId === p.id;
          return (
            // Compact horizontal card (small image left, details right) keeps the carousel short;
            // ~1.3 cards are visible, so it's obvious there's more to swipe/scroll to.
            <div key={p.id} className="relative flex w-[78%] max-w-[300px] flex-shrink-0 snap-start gap-3 border border-line p-2.5">
              <div className="relative h-[84px] w-[84px] flex-shrink-0 bg-[#f4f4f4]">
                {p.image && <Image src={p.image} alt={p.title} fill sizes="84px" className="object-contain" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate text-xs">{p.title}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5 text-xs">
                  {isWallet ? (
                    <>
                      <span className="font-semibold">Gratis</span>
                      <span className="text-muted line-through">{formatSek(p.price)}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{formatSek(p.price)}</span>
                      {p.compareAtPrice != null && p.compareAtPrice > p.price && (
                        <span className="text-muted line-through">{formatSek(p.compareAtPrice)}</span>
                      )}
                    </>
                  )}
                </div>
                {isWallet && <div className="text-[10px] text-muted">Ingår utan extra kostnad</div>}
                <button
                  type="button"
                  aria-expanded={singleVariantId ? undefined : pickerFor === p.id}
                  onClick={() => (singleVariantId ? add(p, singleVariantId) : setPickerFor((id) => (id === p.id ? null : p.id)))}
                  className={`btn-fx mt-auto flex h-8 w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.14em] ${
                    isWallet ? "bg-fg text-bg" : "border border-fg"
                  }`}
                >
                  {added ? "Tillagd ✓" : isWallet ? "Välj gratis" : "Lägg till +"}
                </button>
              </div>
              {pickerFor === p.id && (
                // Products with real options (e.g. ring/bracelet sizes): pick one first, right here.
                <div className="absolute inset-0 z-10 flex flex-col bg-bg p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">Välj storlek – {p.title}</span>
                    <button type="button" aria-label="Stäng" onClick={() => setPickerFor(null)} className="px-1 text-base leading-none">
                      ×
                    </button>
                  </div>
                  <div className="flex flex-wrap content-start gap-1.5 overflow-y-auto">
                    {p.variants.map((v) => {
                      const inCart = cartVariantIds.has(v.id);
                      const label = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || formatSek(v.price);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={!v.available || inCart}
                          onClick={() => add(p, v.id)}
                          title={inCart ? "Finns redan i varukorgen" : undefined}
                          className="btn-fx min-w-9 border border-line px-2 py-1.5 text-[11px] disabled:opacity-40 disabled:line-through"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
