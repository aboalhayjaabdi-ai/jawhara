import { NextRequest, NextResponse } from "next/server";
import {
  getAllProductCards,
  getCollectionProductCards,
  getCollectionProductCount,
  getFilteredAllProducts,
  getFilteredCollectionProducts,
  hasActiveFilter,
  type CollectionFilterOptions,
  type CollectionSort,
} from "@/lib/queries";

const PAGE_SIZE = 24;
const VALID_SORTS: CollectionSort[] = ["manual", "price-asc", "price-desc", "title-asc", "title-desc", "created-desc", "created-asc"];

function parseFilterOptions(sp: URLSearchParams): CollectionFilterOptions {
  const sort = VALID_SORTS.includes(sp.get("sort") as CollectionSort) ? (sp.get("sort") as CollectionSort) : "manual";
  const minPrice = sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined;
  const maxPrice = sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined;
  return {
    sort,
    inStockOnly: sp.get("inStock") === "1",
    minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
  };
}

/**
 * Same real product data as the server-rendered collection page (app/(storefront)/collections/
 * [handle]/page.tsx) -- this route exists purely so pagination/sort/filter changes can fetch just
 * the product grid's data client-side instead of a full Next.js RSC page navigation, which is
 * what made every page-number click feel unresponsive (no local state to update instantly, and
 * no prefetching -- see components/collection/paginated-grid.tsx). Never a second source of
 * truth: literally the same query functions, same PAGE_SIZE, same filter parsing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const filterOptions = parseFilterOptions(sp);
  const filtered = hasActiveFilter(filterOptions);

  let products;
  let total;
  if (handle === "all") {
    ({ cards: products, total } = filtered ? await getFilteredAllProducts(filterOptions, PAGE_SIZE, offset) : await getAllProductCards(PAGE_SIZE, offset));
  } else if (filtered) {
    ({ cards: products, total } = await getFilteredCollectionProducts(handle, filterOptions, PAGE_SIZE, offset));
  } else {
    [products, total] = await Promise.all([getCollectionProductCards(handle, PAGE_SIZE, offset), getCollectionProductCount(handle)]);
  }

  // Same 60s freshness window as the page's own `revalidate = 60` -- Vercel's edge cache can now
  // serve a repeated page/sort/filter combo (across different visitors) without hitting Supabase
  // at all, something the page-level revalidate never covered for any querystring variant.
  return NextResponse.json(
    { products, total },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
