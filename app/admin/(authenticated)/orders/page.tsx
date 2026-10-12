import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { requireAdmin } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";
import { parseOrdersListFilters, applyOrdersListFilters, resolveCarrierOrderIds } from "@/lib/admin/orders-filters";
import { OrdersFilterBar } from "@/components/admin/orders-filter-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { OrdersExportPanel } from "@/components/admin/orders-export-panel";
import { SyncShopifyButton } from "@/components/admin/sync-shopify-button";
import { FulfillmentOrdersTable, type FulfillmentOrderRow } from "@/components/admin/fulfillment-orders-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const admin = await requireAdmin();
  const isFulfillmentStaff = admin.role === "fulfillment_staff";
  const locale = admin.locale;
  // The restricted role never sees hidden/cancelled-order management, exports, syncing, or manual
  // order creation (see lib/admin/permissions.ts + the per-action requireFullAdmin() guards) --
  // "view" is forced to the default "active" list regardless of any query string, even though the
  // simplified UI below never offers a hidden-view control to begin with.
  const filters = parseOrdersListFilters(sp);
  if (isFulfillmentStaff) {
    filters.view = "active";
    filters.carrier = undefined;
    filters.provider = undefined;
  }
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();

  const carrierOrderIds = filters.carrier ? await resolveCarrierOrderIds(filters.carrier) : undefined;

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, email, currency_code, financial_status, fulfillment_status, total_price, created_at, source, cancelled_at, customers(first_name, last_name), order_items(count), fulfillments(tracking_company)",
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
    cancelled_at: o.cancelled_at,
    customerName: o.customers ? [o.customers.first_name, o.customers.last_name].filter(Boolean).join(" ") || null : null,
    itemCount: o.order_items?.[0]?.count ?? 0,
    carrier: (o.fulfillments ?? []).find((f: any) => f.tracking_company)?.tracking_company ?? null,
  }));

  const returnQuery = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""])).toString();
  const pageParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  if (isFulfillmentStaff) {
    const fulfillmentRows: FulfillmentOrderRow[] = rows.map((r) => ({
      id: r.id,
      order_number: r.order_number,
      created_at: r.created_at,
      fulfillment_status: r.fulfillment_status,
      customerName: r.customerName,
    }));

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{t(locale, "orders.title")}</h1>
        </div>

        <form method="GET" className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t(locale, "orders.searchPlaceholder")}
            className="min-w-[220px] flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          <select name="fulfillment" defaultValue={filters.fulfillment ?? ""} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
            <option value="">{t(locale, "orders.filter.all")}</option>
            <option value="UNFULFILLED">{t(locale, "orders.filter.unfulfilled")}</option>
            <option value="PARTIALLY_FULFILLED">{t(locale, "orders.filter.partiallyFulfilled")}</option>
            <option value="FULFILLED">{t(locale, "orders.filter.fulfilled")}</option>
          </select>
          <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800">
            {t(locale, "common.search")}
          </button>
        </form>

        <FulfillmentOrdersTable orders={fulfillmentRows} locale={locale} returnQuery={returnQuery} />

        {(page > 1 || hasNextPage) && (
          <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
            {page > 1 && (
              <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
                ←
              </Link>
            )}
            {hasNextPage && (
              <Link href={`/admin/orders?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
                →
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

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
