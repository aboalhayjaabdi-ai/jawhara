import Link from "next/link";
import { listCustomersWithStats } from "@/lib/admin/customer-stats";
import { parseCustomersListFilters, applyCustomersListFilters } from "@/lib/admin/customers-filters";
import { supabaseService } from "@/lib/supabase/service-client";
import { CustomersFilterBar } from "@/components/admin/customers-filter-bar";
import { CustomerSavedViewsBar } from "@/components/admin/customer-saved-views-bar";
import { CustomersTable, type CustomerRow } from "@/components/admin/customers-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseCustomersListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const all = await listCustomersWithStats();
  const filtered = applyCustomersListFilters(all, filters);
  const total = filtered.length;
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = page * PAGE_SIZE < total;

  const countries = Array.from(new Set(all.map((c) => c.country).filter((c): c is string => !!c))).sort();
  const { data: savedViewRows } = await supabaseService.from("customer_saved_views").select("id, name, filters").order("created_at");

  const rows: CustomerRow[] = pageRows.map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    email: c.email,
    phone: c.phone,
    tags: c.tags,
    acceptsMarketing: c.acceptsMarketing,
    source: c.source,
    anonymized: !!c.anonymizedAt,
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
    country: c.country,
  }));

  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Kunder</h1>
        <div className="flex items-center gap-3">
          <a
            href={`/api/admin/customers/export?${exportParams.toString()}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Exportera CSV
          </a>
          <Link href="/admin/customers/import" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Importera CSV
          </Link>
          <Link href="/admin/customers/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
            Ny kund
          </Link>
        </div>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} kunder totalt</div>

      <CustomerSavedViewsBar savedViews={savedViewRows ?? []} />
      <CustomersFilterBar countries={countries} />
      <CustomersTable customers={rows} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/customers?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/customers?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
