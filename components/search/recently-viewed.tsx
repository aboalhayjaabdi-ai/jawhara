"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/product/product-card";
import { getRecentlyViewed, clearRecentlyViewed } from "@/lib/recently-viewed";
import type { ProductCard as ProductCardType } from "@/lib/queries";

// Real theme: this feature only ever existed in the predictive-search empty state (no standalone
// homepage/PDP section exists in the real export) -- heading "Nyligen visade" (locales/sv.json).
export function RecentlyViewed() {
  const [products, setProducts] = useState<ProductCardType[]>([]);

  useEffect(() => {
    const saved = getRecentlyViewed();
    setProducts(saved);
    if (saved.length === 0) return;
    // The saved list is a snapshot from when each product was viewed -- swap in current prices and
    // stock (products no longer for sale drop out). On any failure the snapshot stays as it was.
    let cancelled = false;
    fetch("/api/products/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handles: saved.map((p) => p.handle) }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.products)) setProducts(data.products as ProductCardType[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (products.length === 0) return null;

  return (
    <div className="pt-10">
      <div className="flex items-center justify-between border-t border-line pt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Nyligen visade</h2>
        <button
          type="button"
          onClick={() => {
            clearRecentlyViewed();
            setProducts([]);
          }}
          className="text-xs font-semibold uppercase tracking-wide text-muted underline"
        >
          Rensa
        </button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-7">
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </div>
  );
}
