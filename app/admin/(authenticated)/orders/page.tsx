import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${Math.round(amount)} ${currency}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  const { data: orders, count } = await supabase
    .from("orders")
    .select(
      "id, order_number, email, currency_code, financial_status, fulfillment_status, total_price, created_at, shopify_id, stripe_checkout_session_id, customers(first_name, last_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Ordrar</h1>
        <div className="text-xs uppercase tracking-wide text-gray-500">{total} ordrar totalt</div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Order</th>
              <th className="px-5 py-3">Datum</th>
              <th className="px-5 py-3">Kund</th>
              <th className="px-5 py-3">Summa</th>
              <th className="px-5 py-3">Betalstatus</th>
              <th className="px-5 py-3">Leveransstatus</th>
              <th className="px-5 py-3">Källa</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o: any) => {
              const customerName = o.customers ? [o.customers.first_name, o.customers.last_name].filter(Boolean).join(" ") : null;
              const provider = o.shopify_id ? "Shopify" : o.stripe_checkout_session_id ? "Stripe" : "—";
              return (
                <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium text-gray-900 hover:underline">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                  <td className="px-5 py-3 text-gray-500">{customerName || o.email || "—"}</td>
                  <td className="px-5 py-3 text-gray-900">{formatMoney(o.total_price, o.currency_code)}</td>
                  <td className="px-5 py-3 text-gray-500">{o.financial_status || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{o.fulfillment_status || "—"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        provider === "Shopify" ? "bg-gray-100 text-gray-700" : provider === "Stripe" ? "bg-gray-900 text-white" : "text-gray-400"
                      }`}
                    >
                      {provider}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(orders ?? []).length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga ordrar hittades.</p>}
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/orders?page=${page - 1}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/orders?page=${page + 1}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
