"use client";

import type { ProductCard } from "@/lib/queries";

// Real theme: assets/recently-viewed-products.js -- localStorage only (no cookie, no customer
// account), max 4 products, most-recent-first, deduped. Stores the exact real ProductCard fields
// a visitor's own browser already rendered on a PDP -- never fetched/invented separately, so this
// can only ever reflect products the visitor genuinely viewed.
const STORAGE_KEY = "jawhara_recently_viewed";
const MAX_PRODUCTS = 4;

export function addRecentlyViewed(product: ProductCard) {
  try {
    const existing = getRecentlyViewed().filter((p) => p.handle !== product.handle);
    const next = [product, ...existing].slice(0, MAX_PRODUCTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore unavailable/corrupted storage
  }
}

export function getRecentlyViewed(): ProductCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearRecentlyViewed() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
