import Link from "next/link";
import { getAllProductCards } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";

// Real theme: templates/404.json. This content is genuinely in English in the real theme, not
// Swedish -- preserved verbatim rather than silently translated, same "exact original text" rule
// applied everywhere else in this migration.
export default async function NotFound() {
  const { cards } = await getAllProductCards(4, 0);

  return (
    <div className="mx-auto max-w-[1328px] px-6 py-20 text-center lg:px-14">
      <h1 className="text-4xl">Page not found</h1>
      <p className="mt-4 text-sm text-muted">The link may be incorrect, or the page has been removed.</p>
      <Link href="/collections/all" className="mt-8 inline-flex h-13 items-center bg-fg px-9 text-xs font-semibold uppercase tracking-widest text-bg">
        Continue shopping
      </Link>

      {cards.length > 0 && (
        <div className="mt-20 border-t border-line pt-14 text-left">
          <div className="flex items-center justify-between">
            <h2 className="text-[26px]">You may also like</h2>
            <Link href="/collections/all" className="text-xs font-semibold uppercase tracking-wide underline">
              View all
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-7">
            {cards.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
