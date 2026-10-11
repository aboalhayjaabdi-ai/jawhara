import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const REASON_LABEL: Record<string, string> = {
  sale: "Försäljning",
  cancellation: "Avbruten order",
  return_restock: "Returnerat (återlagt)",
  manual_adjustment: "Manuell justering",
  received_stock: "Mottaget lager",
  damaged: "Skadat/kasserat",
  correction: "Rättelse",
  initial_import: "Initial import",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InventoryHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const reason = one(sp.reason);
  const from = one(sp.from);
  const to = one(sp.to);
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  let query = supabase
    .from("inventory_movements")
    .select(
      "id, delta, reason, note, resulting_quantity, created_at, orders(order_number), product_variants(title, option1, option2, option3, products(handle, title))",
      { count: "exact" }
    );
  if (reason) query = query.eq("reason", reason);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  query = query.order("created_at", { ascending: false });

  const { data: movements, count } = await query.range(offset, offset + PAGE_SIZE - 1);
  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;

  const filterParams = (p: number) => {
    const params = new URLSearchParams();
    if (reason) params.set("reason", reason);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(p));
    return params.toString();
  };

  return (
    <div className="max-w-5xl">
      <Link href="/admin/products/inventory" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Lågt lager
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Lagerhistorik</h1>

      <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs text-gray-500">Anledning</label>
          <select name="reason" defaultValue={reason ?? ""} className="mt-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm">
            <option value="">Alla</option>
            {Object.entries(REASON_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">Från</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Till</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Filtrera
        </button>
      </form>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} händelser</div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="p-3">Datum</th>
              <th className="p-3">Produkt</th>
              <th className="p-3">Variant</th>
              <th className="p-3">Ändring</th>
              <th className="p-3">Nytt antal</th>
              <th className="p-3">Anledning</th>
              <th className="p-3">Order</th>
              <th className="p-3">Anteckning</th>
            </tr>
          </thead>
          <tbody>
            {(movements as any[] ?? []).map((m) => {
              const variant = m.product_variants;
              const option = [variant?.option1, variant?.option2, variant?.option3].filter(Boolean).join(" / ");
              return (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="p-3 text-xs text-gray-500">{formatDate(m.created_at)}</td>
                  <td className="p-3">
                    {variant?.products?.handle ? (
                      <a href={`/products/${variant.products.handle}`} target="_blank" rel="noreferrer" className="text-gray-900 underline">
                        {variant.products.title}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{option || "—"}</td>
                  <td className={`p-3 font-medium ${m.delta > 0 ? "text-emerald-600" : "text-rose-600"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="p-3 text-xs text-gray-500">{m.resulting_quantity}</td>
                  <td className="p-3 text-xs">{REASON_LABEL[m.reason] ?? m.reason}</td>
                  <td className="p-3 text-xs text-gray-500">{m.orders?.order_number ?? "—"}</td>
                  <td className="p-3 text-xs text-gray-400">{m.note ?? ""}</td>
                </tr>
              );
            })}
            {(!movements || movements.length === 0) && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-gray-400">
                  Inga händelser.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/products/inventory/history?${filterParams(page - 1)}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/products/inventory/history?${filterParams(page + 1)}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
