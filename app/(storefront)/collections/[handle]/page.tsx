import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getAllCollectionHandles,
  getAllProductCards,
  getCollectionMeta,
  getCollectionProductCards,
  getCollectionProductCount,
  getFilteredAllProducts,
  getFilteredCollectionProducts,
  hasActiveFilter,
  type CollectionFilterOptions,
  type CollectionSort,
} from "@/lib/queries";
import { ProductCard } from "@/components/product/product-card";
import { SubcategoryTiles } from "@/components/collection/subcategory-tiles";
import { SortFilterBar } from "@/components/collection/sort-filter-bar";
import { Pagination } from "@/components/collection/pagination";

export const revalidate = 60;

const PAGE_SIZE = 24;
const GRID_ANCHOR_ID = "produktrutnat";
const VALID_SORTS: CollectionSort[] = ["manual", "price-asc", "price-desc", "title-asc", "title-desc", "created-desc", "created-asc"];

// Same reasoning as the product page's generateStaticParams (see lib/queries.ts's
// getAllProductHandles). "all" is Shopify's reserved catch-all route with no real collections
// row, added explicitly since getAllCollectionHandles only returns real DB handles. Note: this
// page also reads `searchParams` (sort/filter/pagination) below, which Next.js's own rules force
// into fully dynamic rendering regardless of generateStaticParams -- that's correct, expected
// behavior for a page with real per-request query-string filtering, not something this can (or
// should) paper over; this still registers the route correctly and costs nothing.
export async function generateStaticParams() {
  const handles = await getAllCollectionHandles();
  return [{ handle: "all" }, ...handles.map((handle) => ({ handle }))];
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  if (handle === "all") {
    // Shopify's reserved /collections/all route has no backing collection row, so no
    // real SEO title/description exists for it in the export -- see docs for this gap.
    return { title: "Alla produkter", alternates: { canonical: "/collections/all" } };
  }
  const meta = await getCollectionMeta(handle);
  if (!meta) return {};
  const title = meta.seo_title || meta.title;
  // Falls back to the site's own real description (app/(storefront)/layout.tsx) rather than
  // omitting the tag -- some collections have neither seo_description nor description_html set.
  const description =
    meta.seo_description ||
    (meta.description_html ? meta.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : undefined) ||
    "Jawhara — smycken och accessoarer";
  return { title, description, alternates: { canonical: `/collections/${handle}` } };
}

function parseFilterOptions(searchParams: { sort?: string; inStock?: string; minPrice?: string; maxPrice?: string }): CollectionFilterOptions {
  const sort = VALID_SORTS.includes(searchParams.sort as CollectionSort) ? (searchParams.sort as CollectionSort) : "manual";
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : undefined;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined;
  return {
    sort,
    inStockOnly: searchParams.inStock === "1",
    minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string; sort?: string; inStock?: string; minPrice?: string; maxPrice?: string }>;
}) {
  const { handle } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const filterOptions = parseFilterOptions(sp);
  const filtered = hasActiveFilter(filterOptions);

  if (handle === "all") {
    const { cards, total } = filtered ? await getFilteredAllProducts(filterOptions, PAGE_SIZE, offset) : await getAllProductCards(PAGE_SIZE, offset);
    if (cards.length === 0 && page === 1 && !filtered) notFound();
    return <CollectionGrid title="Alla produkter" description={null} products={cards} total={total} page={page} />;
  }

  const meta = await getCollectionMeta(handle);
  if (!meta) notFound();

  const [products, total] = filtered
    ? await getFilteredCollectionProducts(handle, filterOptions, PAGE_SIZE, offset).then((r) => [r.cards, r.total] as const)
    : await Promise.all([getCollectionProductCards(handle, PAGE_SIZE, offset), getCollectionProductCount(handle)]);

  return (
    <CollectionGrid
      title={meta.title}
      description={meta.description_html}
      products={products}
      total={total}
      page={page}
      templateSuffix={meta.template_suffix}
    />
  );
}

function CollectionGrid({
  title,
  description,
  products,
  total,
  page,
  templateSuffix = null,
}: {
  title: string;
  description: string | null;
  products: { handle: string }[];
  total: number;
  page: number;
  templateSuffix?: string | null;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-[1328px] px-6 py-14 lg:px-14">
      <div className="pb-8 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">
          {total} {total === 1 ? "PRODUKT" : "PRODUKTER"}
        </div>
        <h1 className="mt-3 text-4xl">{title}</h1>
        {description && <div className="mx-auto mt-3 max-w-xl text-sm text-muted" dangerouslySetInnerHTML={{ __html: description }} />}
      </div>

      {/* Its own separate async query -- streamed in via Suspense so it never holds up the main
          product grid (the same fix applied to the product page's related/complementary sections). */}
      <Suspense fallback={null}>
        <SubcategoryTiles templateSuffix={templateSuffix} />
      </Suspense>

      <div className="mb-8">
        <SortFilterBar />
      </div>

      <div id={GRID_ANCHOR_ID} className="grid grid-cols-2 gap-6 pt-2 lg:grid-cols-4 lg:gap-7">
        {products.map((p: any) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>

      {products.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">Inga produkter matchar valda filter.</p>
      )}

      <Pagination currentPage={page} totalPages={totalPages} gridAnchorId={GRID_ANCHOR_ID} />
    </div>
  );
}
