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
  // Phase 3: forces an immediate (non-debounced) Shopify cart sync and, on success, navigates
  // the browser to that exact cart's Shopify-hosted checkout page. Never navigates on failure --
  // see its own comment below for exactly what counts as failure.
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

  // Shared by the background sync effect below AND goToCheckout's immediate, un-debounced call --
  // one single place that talks to /api/shopify-cart/sync and folds its response into provider
  // state, so the two callers can never disagree about what the current shopifyCartId is. Never
  // throws (the fetch is try/caught here); callers get back the raw parsed result (or null on
  // total failure) and decide what that means for them.
  const shopifyCartIdRef = useRef(shopifyCartId);
  shopifyCartIdRef.current = shopifyCartId;
  const syncWithShopify = useCallback(async (currentItems: CartItem[]) => {
    try {
      const res = await fetch("/api/shopify-cart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyCartId: shopifyCartIdRef.current,
          lines: currentItems.map((i) => ({ variantId: i.variantId, qty: i.qty })),
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
      return data as { shopifyCartId: string | null; checkoutUrl: string | null; warnings: string[] };
    } catch {
      return null;
    }
  }, []);

  // Mirrors the current cart into Shopify in the background -- debounced so rapid qty +/-
  // clicks collapse into one sync, and keyed by a request id (like useCartTotals below) so a
  // slow, now-superseded response can never clobber a newer one. Never blocks or alters the
  // visible cart: on any failure it just records a warning and keeps retrying on the next
  // change, since Supabase (not Shopify) is what prices and persists the customer-visible cart.
  const shopifySyncRequestId = useRef(0);
  useEffect(() => {
    if (!hydrated) return;
    if (items.length === 0) return;
    const id = ++shopifySyncRequestId.current;
    const timeout = setTimeout(async () => {
      const data = await syncWithShopify(items);
      if (id !== shopifySyncRequestId.current) return; // a newer sync superseded this one
      setShopifyWarnings(data ? data.warnings : ["Kunde inte synkronisera varukorgen med Shopify just nu."]);
    }, 500);
    return () => clearTimeout(timeout);
  }, [items, hydrated, syncWithShopify]);

  useEffect(() => {
    if (items.length === 0) setShopifyWarnings([]);
  }, [items.length]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Phase 3: the "Till kassan" button calls this directly instead of waiting for the debounced
  // background sync above, so a click always redirects to a checkoutUrl for the cart's true
  // current contents -- never a stale one from before the customer's last qty change. Treats
  // every kind of sync shortfall (network failure, Storefront API error, or checkout simply not
  // enabled yet -- see app/api/shopify-cart/sync/route.ts's own gate) the same way: no checkoutUrl
  // means no navigation, full stop.
  const goToCheckout = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (itemsRef.current.length === 0) {
      return { ok: false, error: "Din varukorg är tom." };
    }
    const data = await syncWithShopify(itemsRef.current);
    if (!data) {
      return { ok: false, error: "Kunde inte synkronisera varukorgen med Shopify just nu. Försök igen." };
    }
    setShopifyWarnings(data.warnings);
    if (!data.checkoutUrl) {
      return { ok: false, error: "Kassan är inte tillgänglig just nu. Försök igen." };
    }
    window.location.href = data.checkoutUrl;
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
        const res = await fetch("/api/cart/totals", {
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
  }, [items, discountCode]);

  return { totals, loading, fetchError };
}
