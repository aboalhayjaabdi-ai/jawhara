import Link from "next/link";
import type { ProductCard as ProductCardType } from "@/lib/queries";
import { resolveProductList } from "@/lib/product-sections";
import { ProductCard } from "@/components/product/product-card";

type ProductListProps = {
  collectionHandle: string;
  heading: string;
  limit: number;
  layout?: "carousel" | "grid";
  buttonText?: string;
  buttonHref?: string;
  /** "campaign": centered heading, optional intro line, 4-column grid and the button centered BELOW
   * the products -- used for the Black Month sections. Default keeps the original look. */
  variant?: "default" | "campaign";
  intro?: string;
  sort?: "manual" | "best-selling";
  /** Already-resolved products (homepage/Black Month page resolve lists in page order so a product
   * isn't repeated across sections). When omitted, the section fetches its own. */
  products?: ProductCardType[];
  /** Renders above-the-fold card images eagerly. */
  priorityImages?: number;
  id?: string;
};

export async function ProductListSection({
  collectionHandle,
  heading,
  limit,
  layout = "carousel",
  buttonText = "Visa alla",
  buttonHref,
  variant = "default",
  intro,
  sort,
  products: resolved,
  priorityImages = 0,
  id,
}: ProductListProps) {
  const products = resolved ?? (await resolveProductList({ collectionHandle, limit, sort }));
  if (products.length === 0) return null;

  const href = buttonHref || `/collections/${collectionHandle}`;

  if (variant === "campaign") {
    return (
      <section id={id} className="mx-auto max-w-[1328px] scroll-mt-24 px-4 py-12 sm:px-6 lg:px-14 lg:py-16">
        <div className="mb-8 text-center lg:mb-10">
          <h2 className="text-[22px] uppercase leading-tight tracking-[0.06em] sm:text-[28px]">{heading}</h2>
          <div className="mx-auto mt-4 h-px w-10 bg-fg" aria-hidden />
          {intro && <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">{intro}</p>}
        </div>
        <div className={layout === "carousel" ? CAROUSEL_CLASS : "grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-10"}>
          {products.map((p, i) => (
            <ProductCard key={p.handle} product={p} priority={i < priorityImages} />
          ))}
        </div>
        {buttonText && (
          <div className="mt-10 flex justify-center">
            <Link
              href={href}
              className="btn-fx flex h-12 min-w-[240px] items-center justify-center bg-fg px-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-bg"
            >
              {buttonText}
            </Link>
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id} className="mx-auto max-w-[1328px] px-6 py-12 lg:px-14">
      <div className="mb-9 flex items-end justify-between gap-4">
        <h2 className="text-[24px] sm:text-[28px]">{heading}</h2>
        <Link href={href} className="btn-fx flex h-10 shrink-0 items-center bg-fg px-5 text-[11px] font-semibold uppercase tracking-wide text-bg">
          {buttonText}
        </Link>
      </div>
      <div className={layout === "carousel" ? CAROUSEL_CLASS : "grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-7"}>
        {products.map((p, i) => (
          <ProductCard key={p.handle} product={p} priority={i < priorityImages} />
        ))}
      </div>
    </section>
  );
}

const CAROUSEL_CLASS = "grid grid-flow-col auto-cols-[47%] gap-4 overflow-x-auto lg:auto-cols-[31%] lg:gap-7";
