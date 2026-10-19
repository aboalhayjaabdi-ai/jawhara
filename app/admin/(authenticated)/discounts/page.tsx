import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { parseDiscountsListFilters, applyDiscountsListFilters } from "@/lib/admin/discounts-filters";
import { syncDiscountStatuses } from "@/lib/admin/discount-scheduler";
import { syncDiscountToShopify } from "@/lib/shopify/discount-sync";
import { DiscountsFilterBar } from "@/components/admin/discounts-filter-bar";
import { DiscountsTable, type DiscountRow } from "@/components/admin/discounts-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminDiscountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Keeps `status` in sync with starts_at/ends_at on every page load -- see
  // lib/admin/discount-scheduler.ts for why this is what makes scheduling real rather than cosmetic.
  // Also pushes exactly the discounts whose status just flipped (scheduled->active,
  // active/scheduled->expired) to Shopify -- in practice almost always empty, so this adds zero
  // extra Shopify calls to the common page load.
  const { changedIds } = await syncDiscountStatuses();
  await Promise.all(changedIds.map((id) => syncDiscountToShopify(id)));

  const sp = await searchParams;
  const filters = parseDiscountsListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  let query = supabase
    .from("discounts")
    .select("id, title, kind, code, status, get_percentage, buy_quantity, get_quantity, starts_at, ends_at, usage_limit", { count: "exact" });
  query = applyDiscountsListFilters(query as any, filters);
  const { data: discounts, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const ids = (discounts ?? []).map((d) => d.id);
  const { data: redemptionRows } = ids.length
    ? await supabaseService.from("discount_redemptions").select("discount_id").in("discount_id", ids)
    : { data: [] as { discount_id: string }[] };
  const redemptionCountById = new Map<string, number>();
  for (const r of redemptionRows ?? []) redemptionCountById.set(r.discount_id, (redemptionCountById.get(r.discount_id) ?? 0) + 1);

  const rows: DiscountRow[] = (discounts ?? []).map((d) => ({
    id: d.id,
    title: d.title ?? "(namnlös)",
    kind: d.kind as "automatic" | "code",
    code: d.code,
    status: d.status as DiscountRow["status"],
    shape: d.buy_quantity != null && d.get_quantity != null ? "bxgy" : d.get_percentage != null ? "order_percentage" : "other",
    getPercentage: d.get_percentage != null ? Number(d.get_percentage) : null,
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    redemptionCount: redemptionCountById.get(d.id) ?? 0,
    usageLimit: d.usage_limit,
  }));

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;
  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Rabatter</h1>
        <Link href="/admin/discounts/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          Ny rabatt
        </Link>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} rabatter totalt</div>

      <DiscountsFilterBar />
      <DiscountsTable discounts={rows} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/discounts?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/discounts?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
