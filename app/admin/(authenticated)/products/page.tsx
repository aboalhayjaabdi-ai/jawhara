import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { mediaUrl } from "@/lib/supabase/media";
import { parseProductsListFilters, applyProductsListFilters } from "@/lib/admin/products-filters";
import { ProductsFilterBar } from "@/components/admin/products-filter-bar";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const LOW_STOCK_THRESHOLD = 5;

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseProductsListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();

  const { data: collections } = await supabase.from("collections").select("id, title").order("title");

  // stockLevel/collectionId can't be expressed as a plain `products` predicate -- resolve the
  // matching product ids first, then feed them into applyProductsListFilters as a base id set.
  let baseIds: string[] | undefined;
  if (filters.collectionId) {
    const { data } = await supabase.from("collection_products").select("product_id").eq("collection_id", filters.collectionId);
    baseIds = (data ?? []).map((r) => r.product_id);
  }
  if (filters.stockLevel) {
    let variantQuery = supabase.from("product_variants").select("product_id, inventory_quantity, inventory_tracked");
    if (filters.stockLevel === "untracked") variantQuery = variantQuery.eq("inventory_tracked", false);
    else variantQuery = variantQuery.eq("inventory_tracked", true).lte("inventory_quantity", filters.stockLevel === "out" ? 0 : LOW_STOCK_THRESHOLD);
    const { data } = await variantQuery;
    const stockIds = new Set((data ?? []).map((r) => r.product_id));
    baseIds = baseIds ? baseIds.filter((id) => stockIds.has(id)) : Array.from(stockIds);
  }

  let query = supabase
    .from("products")
    .select("id, title, handle, status, vendor, source, created_at, media(storage_path, position), product_variants(price, inventory_quantity)", {
      count: "exact",
    });
  query = applyProductsListFilters(query as any, filters, baseIds);
  const { data: products, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;

  const rows: ProductRow[] = (products ?? []).map((p: any) => {
    const variants = p.product_variants ?? [];
    const prices = variants.map((v: any) => Number(v.price));
    const sortedMedia = [...(p.media ?? [])].sort((a: any, b: any) => a.position - b.position);
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      vendor: p.vendor,
      source: p.source,
      thumbnailUrl: sortedMedia[0] ? mediaUrl(sortedMedia[0].storage_path) : null,
      variantCount: variants.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      totalInventory: variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity ?? 0), 0),
    };
  });

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Produkter</h1>
        <div className="flex items-center gap-3">
          <a
            href={`/api/admin/products/export?${exportParams.toString()}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Exportera CSV
          </a>
          <Link href="/admin/products/import" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Importera CSV
          </Link>
          <Link href="/admin/products/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
            Ny produkt
          </Link>
        </div>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} produkter totalt</div>

      <ProductsFilterBar collections={collections ?? []} />
      <ProductsTable products={rows} collections={collections ?? []} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/products?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/products?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
