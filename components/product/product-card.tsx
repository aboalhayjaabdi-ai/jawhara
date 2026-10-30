"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProductCard as ProductCardType } from "@/lib/queries";
import { useCartActions } from "@/components/cart/cart-provider";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { LinkPendingIndicator } from "@/components/ui/link-pending-indicator";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export function ProductCard({ product }: { product: ProductCardType }) {
  const { addItem } = useCartActions();
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  function addVariant(variantId: string, price: number, compareAtPrice: number | null, variantTitle: string, image: string | null) {
    addItem({
      variantId,
      productHandle: product.handle,
      title: product.title,
      variantTitle: normalizeVariantTitle(variantTitle) ?? "",
      price,
      compareAtPrice,
      image,
    });
  }

  const showQuickAdd = product.available && (product.quickAddVariantId != null || product.variants.length > 1);

  return (
    <Link href={`/products/${product.handle}`} className="block">
      <div className="relative aspect-square bg-[#f4f4f4]">
        <div className="absolute inset-0 overflow-hidden">
          {product.image && <Image src={product.image} alt={product.title} fill className="object-contain" sizes="(min-width: 1024px) 25vw, 50vw" />}
        </div>
        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="bg-bg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-fg">Slut i lager</span>
          </div>
        )}
        {product.available && onSale && (
          <div className="absolute left-3 top-3 bg-fg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-bg">Rea</div>
        )}
        <LinkPendingIndicator />
        {showQuickAdd && (
          <div ref={pickerRef} className="absolute bottom-3 right-3">
            <button
              type="button"
              aria-label="Lägg till i varukorgen"
              aria-haspopup={product.quickAddVariantId == null ? "menu" : undefined}
              aria-expanded={product.quickAddVariantId == null ? pickerOpen : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (product.quickAddVariantId) {
                  const soleVariant = product.variants.find((v) => v.id === product.quickAddVariantId);
                  addVariant(product.quickAddVariantId, product.price, product.compareAtPrice, "Default Title", soleVariant?.image ?? product.image);
                } else {
                  setPickerOpen((v) => !v);
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-fg shadow-sm transition-opacity hover:opacity-80"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {pickerOpen && (
              <div role="menu" className="absolute bottom-full right-0 z-20 mb-2 w-40 border border-line bg-bg py-1.5 shadow-sm">
                {product.variants.map((v) => {
                  const label = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || formatSek(v.price);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="menuitem"
                      disabled={!v.available}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addVariant(v.id, v.price, v.compareAtPrice, label, v.image ?? product.image);
                        setPickerOpen(false);
                      }}
                      className={`block w-full px-3 py-2 text-left text-xs ${
                        v.available ? "hover:bg-[#f4f4f4]" : "text-muted line-through opacity-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-3.5 text-[13px]">{product.title}</div>
      {product.sku && <div className="mt-0.5 text-[11px] text-muted">{product.sku}</div>}
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold">{formatSek(product.price)}</span>
        {onSale && <span className="text-xs text-muted line-through">{formatSek(product.compareAtPrice!)}</span>}
      </div>
    </Link>
  );
}
