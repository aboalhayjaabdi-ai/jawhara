import Image from "next/image";
import Link from "next/link";
import { getFeaturedProduct } from "@/lib/queries";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export async function FeaturedProductSection({ handle }: { handle: string }) {
  const product = await getFeaturedProduct(handle);
  if (!product) return null;
  const variant = product.variants[0];

  return (
    <section className="px-6 py-12 lg:px-14">
      <div className="mx-auto grid max-w-[1328px] items-center gap-10 bg-[#f7f7f7] lg:grid-cols-2 lg:gap-16">
        {product.images[0] && (
          <div className="relative h-[320px] lg:h-[520px]">
            <Image src={product.images[0]} alt={product.title} fill className="object-cover" />
          </div>
        )}
        <div className="px-6 pb-10 lg:pb-0 lg:pr-14">
          <h2 className="text-[32px]">{product.title}</h2>
          {product.description_html && (
            <div
              className="mt-4 max-w-sm text-muted [&_p]:leading-7"
              dangerouslySetInnerHTML={{ __html: product.description_html }}
            />
          )}
          {variant && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-lg font-semibold">{formatSek(variant.price)}</span>
              {variant.compare_at_price != null && variant.compare_at_price > variant.price && (
                <span className="text-sm text-muted line-through">{formatSek(variant.compare_at_price)}</span>
              )}
            </div>
          )}
          <Link href={`/products/${product.handle}`} className="mt-6 inline-flex h-13 items-center bg-fg px-9 text-xs font-semibold uppercase tracking-widest text-bg">
            Visa produkt
          </Link>

          {/* Secondary promo image, exactly as configured in the real section (links to a
              different product than the one featured above -- that's the live theme's own setup). */}
          <Link href="/products/aria-armband-1" className="mt-8 block">
            <Image
              src="/brand/featured-product-link.png"
              alt=""
              width={320}
              height={200}
              className="h-auto w-full max-w-xs object-cover"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
