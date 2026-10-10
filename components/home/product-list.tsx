import Link from "next/link";
import { getAllProductCards, getCollectionProductCards } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";

export async function ProductListSection({
  collectionHandle,
  heading,
  limit,
  layout = "carousel",
  buttonText = "Visa alla",
  buttonHref,
}: {
  collectionHandle: string;
  heading: string;
  limit: number;
  layout?: "carousel" | "grid";
  buttonText?: string;
  buttonHref?: string;
}) {
  // Shopify's /collections/all is a reserved, built-in storefront route (the full
  // catalog) -- it has no backing `collections` row, so it can't be looked up by handle.
  const products =
    collectionHandle === "all"
      ? (await getAllProductCards(limit)).cards
      : await getCollectionProductCards(collectionHandle, limit);
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1328px] px-6 py-12 lg:px-14">
      <div className="mb-9 flex items-end justify-between">
        <h2 className="text-[28px]">{heading}</h2>
        <Link
          href={buttonHref ?? `/collections/${collectionHandle}`}
          className="flex h-10 items-center bg-fg px-5 text-[11px] font-semibold uppercase tracking-wide text-bg"
        >
          {buttonText}
        </Link>
      </div>
      <div
        className={
          layout === "carousel"
            ? "grid grid-flow-col auto-cols-[45%] gap-6 overflow-x-auto lg:auto-cols-[23.5%]"
            : "grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-7"
        }
      >
        {products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>
    </section>
  );
}
