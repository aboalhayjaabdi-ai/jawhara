"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trackAddToCart } from "@/lib/marketing/events";
// Type-only import: compiled away entirely, never pulls lib/discounts.ts's server-only Supabase
// client into the browser bundle -- this is purely the response shape of /api/cart/totals, which
// is a thin wrapper around the same computeCheckoutTotals this type comes from.
import type { CheckoutTotals } from "@/lib/discounts";

export type CartItem = {
  variantId: string;
  productHandle: string;
  title: string;
  variantTitle: string;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  qty: number;
};

// Split into two contexts (state vs. actions) so a component that only needs to call an action
// (e.g. ProductCard's "Lägg till i varukorgen", which exists once per product card -- potentially
// dozens on a single collection/search/related-products grid) doesn't re-render every time
// unrelated cart STATE changes elsewhere on the page (opening the drawer, a qty bump, an add-to-
// cart toast firing). Every action below has a referentially stable identity across renders (via
// useCallback), so CartActionsContext's own value object is stable too -- a pure-actions consumer
// re-renders only when the provider itself remounts, never on cart content changes. useCart()
// below still combines both for the many existing call sites that genuinely need both.
type CartActions = {
  open: () => void;
  close: () => void;
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  setDiscountCode: (code: string | null) => void;
  // Phase 3/4: forces an immediate (non-debounced) Shopify cart sync, verifies Shopify's own
  // computed total actually matches what Jawhara displays, and only then navigates the browser to
  // that exact cart's Shopify-hosted checkout page. Never navigates on failure OR on a price
  // mismatch -- see its own comment below for exactly what counts as either.
  goToCheckout: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  subtotal: number;
  count: number;
  hydrated: boolean;
  // Increments on every addItem call -- a transient "item just added" signal (see useJustAdded
  // below), distinct from `count` (which also changes when qty is adjusted inside an already-open
  // cart, and shouldn't re-trigger the add-to-cart feedback).
  bump: number;
  // A discount code the customer has entered -- never the source of truth for its own
  // validity/amount, only an input to the authoritative computeCheckoutTotals call (see
  // useCartTotals below) that prices what Jawhara itself displays. Not yet sent to Shopify in
  // any form: admin-managed discounts aren't connected to the Shopify side of checkout until
  // Phase 4, so Shopify's own checkout total can disagree with this (see cart-drawer.tsx).
  discountCode: string | null;
  // Customer-safe, Swedish warnings from the most recent background Shopify cart sync (e.g. a
  // variant that couldn't be matched, or a quantity that got clamped to real stock) -- informational
  // only, never blocks adding/removing/checking out, since Supabase (not this) is what prices and
  // gates the visible Jawhara cart in Phase 2.
  shopifyWarnings: string[];
};

type CartContextValue = CartState & CartActions;

const CartActionsContext = createContext<CartActions | null>(null);
const CartStateContext = createContext<CartState | null>(null);

// A stable fingerprint of exactly what Shopify's checkoutUrl/total actually depend on -- the
// variant/qty lines (order-independent) and the discount code. Lets goToCheckout recognize when
// the cart is unchanged since the last successful sync (background or foreground) and skip
// re-hitting Shopify's API entirely (see lastShopifySyncRef below).
function cartFingerprint(items: CartItem[], discountCode: string | null): string {
  const sortedLines = items.map((i) => [i.variantId, i.qty] as const).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({ lines: sortedLines, discountCode });
}

// Every cart/checkout network call goes through this -- a request that hangs (a cold serverless
// function, Supabase connection pressure from a burst of rapid qty clicks, a flaky mobile network)
// used to leave `loading`/`isCheckingOut` stuck true forever, with nothing short of a page refresh
// to recover: nothing anywhere had a ceiling on how long a fetch was allowed to take. This gives
// every one a hard ceiling; past it, the fetch rejects like any other network failure and the
// existing catch/finally blocks handle it the same way (clear the loading state, surface an
// error), so the UI can never wait longer than this for a response that may never come.
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const STORAGE_KEY = "jawhara_cart";
const DISCOUNT_CODE_STORAGE_KEY = "jawhara_discount_code";
// The real Shopify Storefront API cart id this Jawhara cart is mirrored into (lib/shopify/cart-
// sync.ts) -- kept in its own key so a customer's visible cart (STORAGE_KEY, unchanged since
// Phase 1) never depends on whether the Shopify side of the sync has ever succeeded.
const SHOPIFY_CART_ID_STORAGE_KEY = "jawhara_shopify_cart_id";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [bump, setBump] = useState(0);
  const [discountCode, setDiscountCodeState] = useState<string | null>(null);
  const [shopifyCartId, setShopifyCartId] = useState<string | null>(null);
  const [shopifyWarnings, setShopifyWarnings] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
      const code = localStorage.getItem(DISCOUNT_CODE_STORAGE_KEY);
      if (code) setDiscountCodeState(code);
      const shopifyId = localStorage.getItem(SHOPIFY_CART_ID_STORAGE_KEY);
      if (shopifyId) setShopifyCartId(shopifyId);
    } catch {
      // ignore corrupted/unavailable storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, hydrated]);

  const shopifyCartIdRef = useRef(shopifyCartId);
  shopifyCartIdRef.current = shopifyCartId;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const discountCodeRef = useRef(discountCode);
  discountCodeRef.current = discountCode;

  type ShopifySyncResponse = {
    shopifyCartId: string | null;
    checkoutUrl: string | null;
    shopifyTotal: number | null;
    discountCodeApplicable: boolean | null;
    warnings: string[];
  };
  // Last successful sync's result, keyed by the exact cart/discount-code fingerprint it was for --
  // shared by the background effect below and goToCheckout, so a checkout click that finds the
  // cart unchanged since the last sync (almost always true: the background effect keeps this warm
  // as the customer shops) can reuse it instead of paying for another round trip to Shopify's API.
  const lastShopifySyncRef = useRef<{ fingerprint: string; data: ShopifySyncResponse } | null>(null);

  // The actual network call -- never invoked directly (always through syncWithShopify's queue
  // below), and bounded by fetchWithTimeout so a hung request can't leave anything waiting on it
  // stuck forever.
  const runShopifySync = useCallback(async (currentItems: CartItem[], currentDiscountCode: string | null): Promise<ShopifySyncResponse | null> => {
    try {
      const res = await fetchWithTimeout("/api/shopify-cart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyCartId: shopifyCartIdRef.current,
          lines: currentItems.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          discountCode: currentDiscountCode,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return null;
      if (typeof data.shopifyCartId === "string" && data.shopifyCartId !== shopifyCartIdRef.current) {
        setShopifyCartId(data.shopifyCartId);
        try {
          localStorage.setItem(SHOPIFY_CART_ID_STORAGE_KEY, data.shopifyCartId);
        } catch {
          // ignore
        }
      }
      lastShopifySyncRef.current = { fingerprint: cartFingerprint(currentItems, currentDiscountCode), data: data as ShopifySyncResponse };
      return data as ShopifySyncResponse;
    } catch {
      return null;
    }
  }, []);

  // Shared by the background sync effect below AND goToCheckout's immediate, un-debounced call --
  // one single place that talks to /api/shopify-cart/sync and folds its response into provider
  // state, so the two callers can never disagree about what the current shopifyCartId is.
  //
  // Serialized through this one queue: Shopify's own API mutates a cart's lines with separate
  // remove/add calls (lib/shopify/cart-sync.ts), and two of those calls running concurrently
  // against the SAME cart can interleave their mutations unpredictably server-side. That's the
  // real mechanism behind the price-mismatch bug recurring -- a rapid qty change firing a second
  // sync before the first's mutations had finished landing in Shopify. The earlier fix
  // (078e4c8) made each INDIVIDUAL sync compute the right quantity; it never stopped two of them
  // from running at the same time in the first place. This queue does: a call that arrives while
  // one is already in flight waits its turn, then syncs whatever the cart's truly current
  // contents are by then -- never the possibly-already-superseded snapshot it was originally
  // asked to sync, and never a no-op if a call ahead of it in the queue already covered it.
  const syncQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const syncWithShopify = useCallback((): Promise<ShopifySyncResponse | null> => {
    let result: ShopifySyncResponse | null = null;
    const next = syncQueueRef.current.catch(() => {}).then(async () => {
      const latestItems = itemsRef.current;
      const latestDiscountCode = discountCodeRef.current;
      const latestFingerprint = cartFingerprint(latestItems, latestDiscountCode);
      if (lastShopifySyncRef.current?.fingerprint === latestFingerprint) {
        // A call ahead of us in the queue already synced exactly this state -- reuse it
        // instead of making Shopify do the same work twice.
        result = lastShopifySyncRef.current.data;
        return;
      }
      result = await runShopifySync(latestItems, latestDiscountCode);
    });
    syncQueueRef.current = next;
    return next.then(() => result);
  }, [runShopifySync]);

  // Mirrors the current cart (and entered discount code) into Shopify in the background --
  // debounced so rapid qty +/- clicks collapse into one sync, and keyed by a request id (like
  // useCartTotals below) so a slow, now-superseded response can never clobber a newer one. Never
  // blocks or alters the visible cart: on any failure it just records a warning and keeps
  // retrying on the next change, since Supabase (not Shopify) is what prices and persists the
  // customer-visible cart.
  const shopifySyncRequestId = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    if (items.length === 0) return;
    const id = ++shopifySyncRequestId.current;
    const timeout = setTimeout(async () => {
      const data = await syncWithShopify();
      if (id !== shopifySyncRequestId.current) return; // a newer sync superseded this one
      setShopifyWarnings(data ? data.warnings : ["Kunde inte synkronisera varukorgen med Shopify just nu."]);
    }, 500);
    return () => clearTimeout(timeout);
  }, [items, discountCode, hydrated, syncWithShopify]);

  useEffect(() => {
    if (items.length === 0) setShopifyWarnings([]);
  }, [items.length]);

  // Phase 3/4: the "Till kassan" button calls this directly instead of waiting for the debounced
  // background sync above, so a click always redirects to a checkoutUrl for the cart's true
  // current contents -- never a stale one from before the customer's last qty/code change. Treats
  // every kind of sync shortfall (network failure, Storefront API error, or checkout simply not
  // enabled yet -- see app/api/shopify-cart/sync/route.ts's own gate) the same way: no checkoutUrl
  // means no navigation, full stop.
  //
  // Phase 4 price-parity guard: also re-fetches Jawhara's own total (the same call
  // useCartTotals below makes) for this exact cart and compares it against Shopify's own
  // cart.cost.totalAmount in the same sync response. The two should agree once a discount is
  // correctly mirrored to Shopify (lib/shopify/discount-sync.ts) -- if they don't (a discount
  // Shopify doesn't know about yet, a sync that silently dropped an item, a code Shopify
  // considers inapplicable), this refuses to send the customer to checkout at all rather than
  // let them see an unexpected price there. A few öre of rounding slack is allowed; anything more
  // blocks.
  const goToCheckout = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      return { ok: false, error: "Din varukorg är tom." };
    }
    const currentDiscountCode = discountCodeRef.current;
    // Reuse a just-completed sync's result instead of hitting Shopify's API again when nothing
    // about the cart has changed since -- the background effect above already keeps this warm as
    // the customer shops, so by the time they click "Till kassan" it's almost always already
    // fresh, and skipping Shopify's round trip is most of what makes the redirect fast. Any real
    // change (qty, items, or code) changes the fingerprint and falls straight through to a live
    // sync, exactly as before.
    const fingerprint = cartFingerprint(currentItems, currentDiscountCode);
    const cached = lastShopifySyncRef.current;
    const shopifyDataPromise =
      cached && cached.fingerprint === fingerprint && cached.data.checkoutUrl
        ? Promise.resolve(cached.data as ShopifySyncResponse | null)
        : syncWithShopify();
    const [shopifyData, jawharaRes] = await Promise.all([
      shopifyDataPromise,
      fetchWithTimeout("/api/cart/totals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: currentItems.map((i) => ({ variantId: i.variantId, qty: i.qty })), discountCode: currentDiscountCode }),
      })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (!shopifyData) {
      return { ok: false, error: "Kunde inte synkronisera varukorgen med Shopify just nu. Försök igen." };
    }
    setShopifyWarnings(shopifyData.warnings);
    if (!shopifyData.checkoutUrl) {
      return { ok: false, error: "Kassan är inte tillgänglig just nu. Försök igen." };
    }
    if (!jawharaRes || typeof jawharaRes.total !== "number" || (jawharaRes.errors?.length ?? 0) > 0) {
      return { ok: false, error: "Kunde inte bekräfta priset innan kassan. Försök igen." };
    }
    if (shopifyData.discountCodeApplicable === false) {
      return { ok: false, error: "Rabattkoden gäller inte i Shopifys kassa just nu. Ta bort den eller försök igen senare." };
    }
    if (shopifyData.shopifyTotal == null || Math.abs(shopifyData.shopifyTotal - jawharaRes.total) > 1) {
      return {
        ok: false,
        error: `Priset i Shopifys kassa (${Math.round(shopifyData.shopifyTotal ?? 0)} kr) stämmer inte med varukorgen (${Math.round(jawharaRes.total)} kr). Kontakta oss innan du fortsätter.`,
      };
    }
    window.location.href = shopifyData.checkoutUrl;
    return { ok: true };
  }, [syncWithShopify]);

  const setDiscountCode = useCallback((code: string | null) => {
    setDiscountCodeState(code);
    try {
      if (code) localStorage.setItem(DISCOUNT_CODE_STORAGE_KEY, code);
      else localStorage.removeItem(DISCOUNT_CODE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const addItem = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, qty }];
    });
    setBump((b) => b + 1);
    trackAddToCart({ id: item.variantId, title: item.title, price: item.price, currency: "SEK", quantity: qty });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);

  const setQty = useCallback(
    (variantId: string, qty: number) => {
      if (qty <= 0) return removeItem(variantId);
      setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
    },
    [removeItem]
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  const actions = useMemo<CartActions>(
    () => ({ open, close, addItem, removeItem, setQty, setDiscountCode, goToCheckout }),
    [open, close, addItem, removeItem, setQty, setDiscountCode, goToCheckout]
  );
  const state = useMemo<CartState>(
    () => ({ items, isOpen, subtotal, count, hydrated, bump, discountCode, shopifyWarnings }),
    [items, isOpen, subtotal, count, hydrated, bump, discountCode, shopifyWarnings]
  );

  return (
    <CartActionsContext.Provider value={actions}>
      <CartStateContext.Provider value={state}>{children}</CartStateContext.Provider>
    </CartActionsContext.Provider>
  );
}

// Pure-actions hook -- use this instead of useCart() in any component that never reads cart
// STATE (items/isOpen/count/etc.), so it never re-renders when that state changes. ProductCard and
// ProductDetail's add-to-cart buttons are the main beneficiaries (see the comment above the
// context definitions).
export function useCartActions(): CartActions {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error("useCartActions must be used within CartProvider");
  return ctx;
}

export function useCart(): CartContextValue {
  const actions = useCartActions();
  const state = useContext(CartStateContext);
  if (!state) throw new Error("useCart must be used within CartProvider");
  return { ...state, ...actions };
}

/**
 * True for `durationMs` after every real addItem() call (skips the initial mount), then false
 * again -- a shared "just added" signal for add-to-cart feedback (icon/badge pop, toast), each
 * consumer picking its own duration off the same underlying `bump` counter.
 */
export function useJustAdded(durationMs: number): boolean {
  const { bump } = useCart();
  const [active, setActive] = useState(false);
  const prevBump = useRef(bump);

  useEffect(() => {
    if (bump === prevBump.current) return;
    prevBump.current = bump;
    setActive(true);
    const timeout = setTimeout(() => setActive(false), durationMs);
    return () => clearTimeout(timeout);
  }, [bump, durationMs]);

  return active;
}

/**
 * The single place the cart drawer and /kassa's order summary both get real totals from -- always
 * a fresh call to /api/cart/totals (app/api/cart/totals/route.ts), which wraps computeCheckoutTotals().
 * This is Jawhara's own price, including admin-managed discounts (3-for-2 etc.) -- it is NOT what
 * Shopify's hosted checkout (Phase 3, via goToCheckout above) will charge, since those discounts
 * aren't connected to Shopify yet (Phase 4). Never computes a price/discount itself; re-fetches
 * (debounced) whenever the cart contents or discount code change, so quantity edits, removals,
 * and code changes all stay correct without the caller needing to re-derive anything client-side.
 */
export function useCartTotals(): { totals: CheckoutTotals | null; loading: boolean; fetchError: string | null } {
  const { items, discountCode } = useCart();
  const [totals, setTotals] = useState<CheckoutTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestId = useRef(0);
  // Bumped on every pageshow (covers a bfcache restore landing back on a page that was frozen
  // mid-fetch) to force a clean re-fetch even when items/discountCode haven't changed -- a
  // request that was in flight when the page got frozen can't be trusted to still be resolving
  // correctly once it thaws, and the effect below has no other way to know that happened.
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    function onPageShow() {
      setRefreshNonce((n) => n + 1);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      setTotals(null);
      setLoading(false);
      setFetchError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        // fetchWithTimeout is what actually guarantees this can't hang forever -- without it, a
        // slow/hung response here left `loading` (and so the disabled "Till kassan" button)
        // stuck true indefinitely, with nothing short of a full page refresh to recover. That
        // was the real cause of the button going permanently grey after an ordinary add/remove/
        // qty change: no logic bug in the state transitions themselves, just no ceiling on how
        // long one was ever allowed to take.
        const res = await fetchWithTimeout("/api/cart/totals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cart: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
            discountCode,
          }),
        });
        const data = await res.json();
        if (id !== requestId.current) return; // a newer request superseded this one
        if (!res.ok) {
          setFetchError(data.error ?? "Kunde inte beräkna totalsumman.");
          setTotals(null);
        } else {
          setTotals(data as CheckoutTotals);
          setFetchError(null);
        }
      } catch {
        if (id !== requestId.current) return;
        setFetchError("Kunde inte beräkna totalsumman.");
        setTotals(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 300); // debounce rapid qty +/- clicks
    return () => clearTimeout(timeout);
  }, [items, discountCode, refreshNonce]);

  return { totals, loading, fetchError };
}
