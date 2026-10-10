import Image from "next/image";
import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/lib/queries";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export function ProductCard({ product }: { product: ProductCardType }) {
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  return (
    <Link href={`/products/${product.handle}`} className="block">
      <div className="relative aspect-[1/1.25] overflow-hidden bg-[#f4f4f4]">
        {product.image && <Image src={product.image} alt={product.title} fill className="object-cover" sizes="(min-width: 1024px) 25vw, 50vw" />}
        {onSale && (
          <div className="absolute left-3 top-3 bg-fg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-bg">Rea</div>
        )}
      </div>
      <div className="mt-3.5 text-[13px]">{product.title}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold">{formatSek(product.price)}</span>
        {onSale && <span className="text-xs text-muted line-through">{formatSek(product.compareAtPrice!)}</span>}
      </div>
    </Link>
  );
}
