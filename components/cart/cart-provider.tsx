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
  // A discount code the customer has entered, carried from the cart drawer through to /kassa so
  // the same code is already applied once a real checkout session exists -- never the source of
  // truth for its own validity/amount, only an input to the authoritative computeCheckoutTotals
  // call (see useCartTotals below).
  discountCode: string | null;
};

type CartContextValue = CartState & CartActions;

const CartActionsContext = createContext<CartActions | null>(null);
const CartStateContext = createContext<CartState | null>(null);

const STORAGE_KEY = "jawhara_cart";
const DISCOUNT_CODE_STORAGE_KEY = "jawhara_discount_code";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [bump, setBump] = useState(0);
  const [discountCode, setDiscountCodeState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
      const code = localStorage.getItem(DISCOUNT_CODE_STORAGE_KEY);
      if (code) setDiscountCodeState(code);
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
    () => ({ open, close, addItem, removeItem, setQty, setDiscountCode }),
    [open, close, addItem, removeItem, setQty, setDiscountCode]
  );
  const state = useMemo<CartState>(
    () => ({ items, isOpen, subtotal, count, hydrated, bump, discountCode }),
    [items, isOpen, subtotal, count, hydrated, bump, discountCode]
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
 * The single place the cart drawer and /kassa's order summary both get real totals from --
 * always a fresh call to /api/cart/totals (app/api/cart/totals/route.ts), which wraps the same
 * computeCheckoutTotals() a real checkout flow will use to charge the customer.
 * Never computes a price/discount itself; re-fetches (debounced) whenever the cart contents or
 * discount code change, so quantity edits, removals, and code changes all stay correct without
 * the caller needing to re-derive anything client-side.
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
