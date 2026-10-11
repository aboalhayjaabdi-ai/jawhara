import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${Math.round(amount)} ${currency}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, email, phone, currency_code, financial_status, fulfillment_status, subtotal_price, total_shipping, total_tax, total_discounts, total_price, note, tags, cancelled_at, cancel_reason, processed_at, created_at, shopify_id, stripe_checkout_session_id, shipping_address_id, customer_id, customers(first_name, last_name, email, phone)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: items }, { data: payments }, { data: fulfillments }, { data: refunds }, { data: shippingAddress }] = await Promise.all([
    supabase.from("order_items").select("id, title, sku, quantity, unit_price, discounted_unit_price").eq("order_id", order.id),
    supabase.from("payments").select("id, kind, status, gateway, amount, currency_code, processed_at, stripe_payment_intent_id").eq("order_id", order.id),
    supabase.from("fulfillments").select("id, status, tracking_number, tracking_url, tracking_company, created_at").eq("order_id", order.id),
    supabase.from("refunds").select("id, amount, reason, created_at").eq("order_id", order.id),
    order.shipping_address_id
      ? supabase
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, province, zip, country, phone")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customer = order.customers as any;
  const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : null;
  const provider = order.shopify_id ? "Shopify" : order.stripe_checkout_session_id ? "Stripe" : "—";

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/orders" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
            ← Ordrar
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{order.order_number}</h1>
          <div className="mt-1 text-sm text-gray-500">{formatDate(order.created_at)}</div>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            provider === "Shopify" ? "bg-gray-100 text-gray-700" : provider === "Stripe" ? "bg-gray-900 text-white" : "text-gray-400"
          }`}
        >
          {provider}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Artiklar
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{item.title}</div>
                      {item.sku && <div className="text-xs text-gray-500">{item.sku}</div>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">× {item.quantity}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      {formatMoney((item.discounted_unit_price ?? item.unit_price) * item.quantity, order.currency_code)}
                    </td>
                  </tr>
                ))}
                {(items ?? []).length === 0 && (
                  <tr>
                    <td className="px-5 py-6 text-center text-sm text-gray-400" colSpan={3}>
                      Inga artiklar hittades.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="space-y-1.5 border-t border-gray-200 px-5 py-4 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Delsumma</span>
                <span>{formatMoney(order.subtotal_price, order.currency_code)}</span>
              </div>
              {order.total_discounts != null && order.total_discounts > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Rabatt</span>
                  <span>−{formatMoney(order.total_discounts, order.currency_code)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500">
                <span>Frakt</span>
                <span>{formatMoney(order.total_shipping, order.currency_code)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Moms</span>
                <span>{formatMoney(order.total_tax, order.currency_code)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold text-gray-900">
                <span>Totalt</span>
                <span>{formatMoney(order.total_price, order.currency_code)}</span>
              </div>
            </div>
          </div>

          {(fulfillments ?? []).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Leverans
              </div>
              <div className="divide-y divide-gray-100">
                {(fulfillments ?? []).map((f) => (
                  <div key={f.id} className="px-5 py-3 text-sm">
                    <div className="font-medium text-gray-900">{f.status || "—"}</div>
                    {f.tracking_number && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {f.tracking_company ? `${f.tracking_company}: ` : ""}
                        {f.tracking_url ? (
                          <a href={f.tracking_url} target="_blank" rel="noreferrer" className="underline">
                            {f.tracking_number}
                          </a>
                        ) : (
                          f.tracking_number
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(refunds ?? []).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Återbetalningar
              </div>
              <div className="divide-y divide-gray-100">
                {(refunds ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <div className="text-gray-900">{r.reason || "Återbetalning"}</div>
                      <div className="text-xs text-gray-500">{formatDate(r.created_at)}</div>
                    </div>
                    <div className="font-medium text-gray-900">{formatMoney(r.amount, order.currency_code)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Betalning</span>
                <span className="font-medium text-gray-900">{order.financial_status || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Leverans</span>
                <span className="font-medium text-gray-900">{order.fulfillment_status || "—"}</span>
              </div>
              {order.cancelled_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Avbruten</span>
                  <span className="font-medium text-gray-900">{formatDate(order.cancelled_at)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Kund</div>
            <div className="text-sm text-gray-900">{customerName || "Gäst"}</div>
            <div className="text-sm text-gray-500">{customer?.email ?? order.email ?? "—"}</div>
            {(customer?.phone ?? order.phone) && <div className="text-sm text-gray-500">{customer?.phone ?? order.phone}</div>}
          </div>

          {shippingAddress && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Leveransadress</div>
              <div className="space-y-0.5 text-sm text-gray-900">
                <div>
                  {shippingAddress.first_name} {shippingAddress.last_name}
                </div>
                <div>{shippingAddress.address1}</div>
                {shippingAddress.address2 && <div>{shippingAddress.address2}</div>}
                <div>
                  {shippingAddress.zip} {shippingAddress.city}
                </div>
                <div>{shippingAddress.country}</div>
              </div>
            </div>
          )}

          {(payments ?? []).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Betalning</div>
              <div className="space-y-2">
                {(payments ?? []).map((p) => (
                  <div key={p.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{p.gateway || provider}</span>
                      <span className="font-medium text-gray-900">{formatMoney(p.amount, p.currency_code ?? order.currency_code)}</span>
                    </div>
                    <div className="text-xs text-gray-500">{p.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.note && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Anteckning</div>
              <div className="text-sm text-gray-700">{order.note}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
