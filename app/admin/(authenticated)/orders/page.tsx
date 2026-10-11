import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { parseOrdersListFilters, applyOrdersListFilters } from "@/lib/admin/orders-filters";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { SyncShopifyButton } from "@/components/admin/sync-shopify-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseOrdersListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  let query = supabase
    .from("orders")
    .select(
      "id, order_number, email, currency_code, financial_status, fulfillment_status, total_price, created_at, source, customers(first_name, last_name)",
      { count: "exact" }
    );
  query = applyOrdersListFilters(query as any, filters);
  const { data: orders, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;

  const rows: OrderRow[] = (orders ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    email: o.email,
    total_price: o.total_price,
    currency_code: o.currency_code,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    source: o.source,
    customerName: o.customers ? [o.customers.first_name, o.customers.last_name].filter(Boolean).join(" ") || null : null,
  }));

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Ordrar</h1>
        <div className="flex items-center gap-3">
          <SyncShopifyButton />
          <a href={`/api/admin/orders/export?${exportParams.toString()}`} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Exportera CSV
          </a>
          <Link href="/admin/orders/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
            Ny order
          </Link>
        </div>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} ordrar totalt</div>

      <OrdersFilterBar />
      <OrdersTable orders={rows} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
