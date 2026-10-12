import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { parseOrdersListFilters, applyOrdersListFilters, resolveCarrierOrderIds } from "@/lib/admin/orders-filters";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { OrdersExportPanel } from "@/components/admin/orders-export-panel";
import { SyncShopifyButton } from "@/components/admin/sync-shopify-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseOrdersListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();

  const carrierOrderIds = filters.carrier ? await resolveCarrierOrderIds(filters.carrier) : undefined;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, email, currency_code, financial_status, fulfillment_status, total_price, created_at, source, customers(first_name, last_name)",
      { count: "exact" }
    );
  query = applyOrdersListFilters(query as any, filters, carrierOrderIds);
  const { data: orders, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  // Real carrier names seen in fulfillments, for the filter dropdown -- never a hardcoded list.
  const { data: carrierRows } = await supabaseService.from("fulfillments").select("tracking_company").not("tracking_company", "is", null);
  const carriers = [...new Set((carrierRows ?? []).map((r) => r.tracking_company as string))].sort();

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

  const returnQuery = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""])).toString();
  const pageParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Ordrar</h1>
        <div className="flex items-center gap-3">
          <SyncShopifyButton />
          <OrdersExportPanel matchingCount={total} />
          <Link href="/admin/orders/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
            Ny order
          </Link>
        </div>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">
        {total} {filters.view === "hidden" ? "borttagna ordrar" : "ordrar"} totalt
      </div>

      <OrdersFilterBar carriers={carriers} />
      <OrdersTable orders={rows} viewingHidden={filters.view === "hidden"} returnQuery={returnQuery} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
