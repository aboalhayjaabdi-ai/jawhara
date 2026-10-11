"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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

type CartContextValue = {
  items: CartItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  subtotal: number;
  count: number;
  hydrated: boolean;
  // Increments on every addItem call -- a transient "item just added" signal (see useJustAdded
  // below), distinct from `count` (which also changes when qty is adjusted inside an already-open
  // cart, and shouldn't re-trigger the add-to-cart feedback).
  bump: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "jawhara_cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
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

  function addItem(item: Omit<CartItem, "qty">, qty = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, qty }];
    });
    setBump((b) => b + 1);
  }

  function removeItem(variantId: string) {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  function setQty(variantId: string, qty: number) {
    if (qty <= 0) return removeItem(variantId);
    setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        addItem,
        removeItem,
        setQty,
        subtotal,
        count,
        hydrated,
        bump,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
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
