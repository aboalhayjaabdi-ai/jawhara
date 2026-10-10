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
    setProducts(getRecentlyViewed());
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
