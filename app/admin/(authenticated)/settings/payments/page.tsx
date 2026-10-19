import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatSek(amount: number | null) {
  if (amount == null) return "—";
  return `${Math.round(amount).toLocaleString("sv-SE")} kr`;
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  refunded: "bg-gray-100 text-gray-500",
};

export default async function AdminPaymentsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);

  const supabase = await createAuthServerClient();

  const { data: payments, count } = await supabase
    .from("payments")
    .select("id, kind, status, gateway, amount, currency_code, processed_at, stripe_payment_intent_id, orders(id, order_number)", { count: "exact" })
    .order("processed_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;
  const checkoutEnabled = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";

  return (
    <div className="max-w-3xl">
      <Link href="/admin/settings" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Inställningar
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Betalningar</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Betalningsleverantör</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            <span className="font-medium text-gray-900">Stripe borttaget</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Stripe är avinstallerat. Kassan flyttas till Shopify Checkout -- historiken nedan är bevarad.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Kassastatus</div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${checkoutEnabled ? "bg-emerald-500" : "bg-gray-300"}`} />
            <span className="font-medium text-gray-900">{checkoutEnabled ? "Aktiverad" : "Avaktiverad"}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Styrs av NEXT_PUBLIC_CHECKOUT_ENABLED på driftmiljön -- ändras inte härifrån, visas bara.
          </p>
        </div>
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} betalningar totalt</div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Metod</th>
              <th className="px-4 py-3">Belopp</th>
              <th className="px-4 py-3">Datum</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p: any) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {p.orders ? (
                    <Link href={`/admin/orders/${p.orders.id}`} className="font-medium text-gray-900 underline">
                      {p.orders.order_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[p.status ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                    {p.status ?? "okänd"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.gateway ?? "—"}</td>
                <td className="px-4 py-3 text-gray-900">{formatSek(p.amount)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(p.processed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(payments ?? []).length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga betalningar hittades.</p>}
      </div>

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/settings/payments?page=${page - 1}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/settings/payments?page=${page + 1}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
