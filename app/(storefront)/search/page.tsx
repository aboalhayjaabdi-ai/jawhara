import type { Metadata } from "next";
import { searchProductCards } from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";
import { RecentlyViewed } from "@/components/search/recently-viewed";
import { SearchForm } from "@/components/search/search-form";

export const metadata: Metadata = { title: "Sök" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const products = query ? await searchProductCards(query) : [];

  return (
    <div className="mx-auto max-w-[1328px] px-6 py-14 lg:px-14">
      <SearchForm initialQuery={query} />

      {query && (
        <div className="pb-8 pt-10 text-center text-xs font-semibold uppercase tracking-wide text-muted">
          {products.length} {products.length === 1 ? "RESULTAT" : "RESULTAT"} FÖR &quot;{query}&quot;
        </div>
      )}

      {query && products.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">Inga produkter hittades.</p>
      )}

      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-6 border-t border-line pt-10 lg:grid-cols-4 lg:gap-7">
          {products.map((p) => (
            <ProductCard key={p.handle} product={p} />
          ))}
        </div>
      )}

      {!query && <RecentlyViewed />}
    </div>
  );
}
