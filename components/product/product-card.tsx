"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/lib/queries";
import { useCart } from "@/components/cart/cart-provider";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export function ProductCard({ product }: { product: ProductCardType }) {
  const { addItem } = useCart();
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <Link href={`/products/${product.handle}`} className="block">
      <div className="relative aspect-[1/1.25] overflow-hidden bg-[#f4f4f4]">
        {product.image && <Image src={product.image} alt={product.title} fill className="object-cover" sizes="(min-width: 1024px) 25vw, 50vw" />}
        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="bg-bg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-fg">Slut i lager</span>
          </div>
        )}
        {product.available && onSale && (
          <div className="absolute left-3 top-3 bg-fg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-bg">Rea</div>
        )}
        {product.available && product.quickAddVariantId && (
          <button
            type="button"
            aria-label="Lägg till i varukorgen"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addItem({
                variantId: product.quickAddVariantId!,
                productHandle: product.handle,
                title: product.title,
                variantTitle: "Default Title",
                price: product.price,
                image: product.image,
              });
            }}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-bg text-fg shadow-sm transition-opacity hover:opacity-80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
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
