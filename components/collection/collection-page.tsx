import { notFound } from "next/navigation";
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
  type CollectionSort,
} from "@/lib/queries";
import { getCollectionTileGroup, type CollectionTile } from "@/lib/collection-tiles";
import { ProductCard } from "@/components/product/product-card";
import { SubcategoryTiles } from "@/components/collection/subcategory-tiles";
import { SortFilterBar } from "@/components/collection/sort-filter-bar";
import { Pagination } from "@/components/collection/pagination";

// Shared by the two collection routes: app/(storefront)/collections/[handle] (the default view --
// page 1, recommended sort -- statically generated and revalidated every 60s like product pages) and
// app/(storefront)/collections-view/[handle] (any other page/sort, rendered per request).
// middleware.ts sends ?page=/?sort= requests to the latter; the browser URL never changes.

const PAGE_SIZE = 24;
const GRID_ANCHOR_ID = "produktrutnat";
const SORT_ANCHOR_ID = "sortering";
// Small campaign line shown directly under the collection title, keyed by the collection's
// template group -- so a main collection and every sub-collection in its group all get it.
// Handles in `exclude` share a group's template but aren't part of that offer (gift sets aren't
// in the "Valfritt Smycke" discount). `icon: false` renders the same box without the gift icon.
type CollectionPromo = { text: string; emphasis: string; icon: boolean; exclude?: string[] };
const GIFT_PROMO: CollectionPromo = { text: "Köp en väska få ett valfritt smycke", emphasis: "på köpet!", icon: true, exclude: ["gift-sets"] };
const JEWELRY_PROMO: CollectionPromo = { text: "3 för 2", emphasis: "på alla smycken!", icon: false };
const COLLECTION_PROMOS: Record<string, CollectionPromo> = {
  vaskor: GIFT_PROMO,
  "alla-smycken": JEWELRY_PROMO,
  armband: JEWELRY_PROMO,
  "klover-armband": JEWELRY_PROMO,
  halsband: JEWELRY_PROMO,
  ringar: JEWELRY_PROMO,
  orhangen: JEWELRY_PROMO,
};

function promoFor(templateSuffix: string | null, handle: string) {
  const promo = templateSuffix ? COLLECTION_PROMOS[templateSuffix] : undefined;
  return promo && !promo.exclude?.includes(handle) ? promo : undefined;
}
const VALID_SORTS: CollectionSort[] = ["manual", "price-asc", "price-desc", "title-asc", "title-desc", "created-desc", "created-asc"];

// "all" is Shopify's reserved catch-all route with no real collections row, added explicitly since
// getAllCollectionHandles only returns real DB handles.
export async function collectionStaticParams() {
  const handles = await getAllCollectionHandles();
  return [{ handle: "all" }, ...handles.map((handle) => ({ handle }))];
}

export async function collectionMetadata(handle: string): Promise<Metadata> {
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

/** Only sorting is offered on the storefront -- the stock/price filter UI was removed, so stale
 * inStock/minPrice/maxPrice query params from old links are ignored rather than silently applied. */
export function parseCollectionParams(searchParams: { page?: string; sort?: string }): { page: number; sort: CollectionSort } {
  const sort = VALID_SORTS.includes(searchParams.sort as CollectionSort) ? (searchParams.sort as CollectionSort) : "manual";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  return { page, sort };
}

export async function CollectionView({ handle, page, sort }: { handle: string; page: number; sort: CollectionSort }) {
  const offset = (page - 1) * PAGE_SIZE;
  const filterOptions = { sort };
  const filtered = hasActiveFilter(filterOptions);
  const basePath = `/collections/${handle}`;

  if (handle === "all") {
    const { cards, total } = filtered ? await getFilteredAllProducts(filterOptions, PAGE_SIZE, offset) : await getAllProductCards(PAGE_SIZE, offset);
    if (cards.length === 0 && page === 1 && !filtered) notFound();
    return <CollectionGrid title="Alla produkter" description={null} products={cards} total={total} page={page} sort={sort} basePath={basePath} />;
  }

  // meta is a tiny single-row lookup, awaited alone first since the tile query below needs its
  // template_suffix value before it can even start. The product query doesn't depend on meta at
  // all, so it joins the tile query below instead -- both start together right after meta
  // resolves, rather than either one waiting on the other.
  const meta = await getCollectionMeta(handle);
  if (!meta) notFound();

  const [[products, total], tiles] = await Promise.all([
    filtered
      ? getFilteredCollectionProducts(handle, filterOptions, PAGE_SIZE, offset).then((r) => [r.cards, r.total] as const)
      : Promise.all([getCollectionProductCards(handle, PAGE_SIZE, offset), getCollectionProductCount(handle)]),
    // Small, single-purpose query (two indexed lookups) -- resolved here as part of the same
    // initial render instead of its own Suspense-streamed component, so the subcollection tiles
    // never visibly pop in after the rest of the page has already painted.
    getCollectionTileGroup(meta.template_suffix, handle),
  ]);

  return (
    <CollectionGrid
      title={meta.title}
      description={meta.description_html}
      products={products}
      total={total}
      page={page}
      sort={sort}
      basePath={basePath}
      tiles={tiles}
      promo={promoFor(meta.template_suffix, handle)}
      currentHandle={handle}
    />
  );
}

function CollectionGrid({
  title,
  description,
  products,
  total,
  page,
  sort,
  basePath,
  tiles = [],
  promo,
  currentHandle,
}: {
  title: string;
  description: string | null;
  products: { handle: string }[];
  total: number;
  page: number;
  sort: CollectionSort;
  basePath: string;
  tiles?: CollectionTile[];
  promo?: CollectionPromo;
  currentHandle?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-[1328px] px-6 py-14 lg:px-14">
      <div className="pb-8 text-center">
        <h1 className="text-4xl">{title}</h1>
        {description && <div className="mx-auto mt-3 max-w-xl text-sm text-muted" dangerouslySetInnerHTML={{ __html: description }} />}
        {promo && (
          <div className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-3 border border-line bg-[#f7f7f7] px-4 py-3 text-left sm:px-6">
            {promo.icon && (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0" aria-hidden>
                  <rect x="3" y="8" width="18" height="4" rx="1" />
                  <path d="M12 8v13" />
                  <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                  <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
                </svg>
                <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
              </>
            )}
            <p className="text-[13px] leading-snug sm:text-sm">
              {promo.text} <span className="font-semibold">{promo.emphasis}</span>
            </p>
          </div>
        )}
      </div>

      <SubcategoryTiles tiles={tiles} currentHandle={currentHandle} />

      {/* scroll-mt = the sticky header's height: a page change lands with the filter right below it */}
      <div id={SORT_ANCHOR_ID} className="mb-8 scroll-mt-[68px]">
        <SortFilterBar basePath={basePath} currentSort={sort} />
      </div>

      <div id={GRID_ANCHOR_ID} className="grid grid-cols-2 gap-2 pt-2 lg:grid-cols-3 lg:gap-7">
        {products.map((p: any, i: number) => (
          // The first row (2 cols mobile, 3 desktop) is the real LCP candidate on this page --
          // there's no hero above it, unlike the homepage. next/image lazy-loads by default, which
          // was silently delaying discovery of exactly the image Core Web Vitals measures.
          <ProductCard key={p.handle} product={p} priority={i < 4} />
        ))}
      </div>

      {products.length === 0 && (
        <p className="pt-10 text-center text-sm text-muted">Inga produkter matchar valda filter.</p>
      )}

      <Pagination currentPage={page} totalPages={totalPages} gridAnchorId={SORT_ANCHOR_ID} basePath={basePath} sort={sort} />
    </div>
  );
}
