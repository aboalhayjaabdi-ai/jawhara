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
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="font-serif text-2xl">Ordrar</h1>
        <div className="text-xs uppercase tracking-wide text-muted">{total} ordrar totalt</div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2.5 pr-4">Order</th>
            <th className="py-2.5 pr-4">Datum</th>
            <th className="py-2.5 pr-4">Kund</th>
            <th className="py-2.5 pr-4">Summa</th>
            <th className="py-2.5 pr-4">Betalstatus</th>
            <th className="py-2.5 pr-4">Leveransstatus</th>
            <th className="py-2.5">Källa</th>
          </tr>
        </thead>
        <tbody>
          {(orders ?? []).map((o: any) => {
            const customerName = o.customers ? [o.customers.first_name, o.customers.last_name].filter(Boolean).join(" ") : null;
            const provider = o.shopify_id ? "Shopify" : o.stripe_checkout_session_id ? "Stripe" : "—";
            return (
              <tr key={o.id} className="border-b border-line">
                <td className="py-2.5 pr-4 font-medium">{o.order_number}</td>
                <td className="py-2.5 pr-4 text-muted">{formatDate(o.created_at)}</td>
                <td className="py-2.5 pr-4 text-muted">{customerName || o.email || "—"}</td>
                <td className="py-2.5 pr-4">{formatMoney(o.total_price, o.currency_code)}</td>
                <td className="py-2.5 pr-4 text-muted">{o.financial_status || "—"}</td>
                <td className="py-2.5 pr-4 text-muted">{o.fulfillment_status || "—"}</td>
                <td className="py-2.5">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      provider === "Shopify" ? "bg-[#f4f4f4] text-fg" : provider === "Stripe" ? "bg-fg text-bg" : "text-muted"
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

      {(orders ?? []).length === 0 && <p className="py-10 text-center text-sm text-muted">Inga ordrar hittades.</p>}

      {(page > 1 || hasNextPage) && (
        <div className="mt-8 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && <Link href={`/admin/orders?page=${page - 1}`}>Föregående</Link>}
          {hasNextPage && <Link href={`/admin/orders?page=${page + 1}`}>Nästa</Link>}
        </div>
      )}
    </div>
  );
}
