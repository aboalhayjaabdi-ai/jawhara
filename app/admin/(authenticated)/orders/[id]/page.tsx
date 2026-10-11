import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { OrderNotesCard } from "@/components/admin/order-notes-card";
import { FulfillmentForm } from "@/components/admin/fulfillment-form";
import { RefundForm } from "@/components/admin/refund-form";
import { CancelOrderButton } from "@/components/admin/cancel-order-button";
import { ReturnForm } from "@/components/admin/return-form";
import { OrderActivityTimeline } from "@/components/admin/order-activity-timeline";

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
      "id, order_number, email, phone, currency_code, financial_status, fulfillment_status, subtotal_price, total_shipping, total_tax, total_discounts, total_price, note, tags, cancelled_at, cancel_reason, processed_at, created_at, shopify_id, stripe_checkout_session_id, source, shipping_address_id, customer_id, customers(first_name, last_name, email, phone)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const [{ data: items }, { data: payments }, { data: fulfillments }, { data: refunds }, { data: shippingAddress }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, title, sku, quantity, unit_price, discounted_unit_price, fulfilled_quantity, refunded_quantity, variant_id")
      .eq("order_id", order.id),
    supabase.from("payments").select("id, kind, status, gateway, amount, currency_code, processed_at, stripe_payment_intent_id").eq("order_id", order.id),
    supabase.from("fulfillments").select("id, status, tracking_number, tracking_url, tracking_company, created_at").eq("order_id", order.id),
    supabase.from("refunds").select("id, amount, reason, created_at, kind").eq("order_id", order.id),
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
  const provider = order.source === "shopify" ? "Shopify" : order.source === "stripe" ? "Stripe" : "Manuell";

  // Guest orders (the vast majority -- customer_id is only ever set for Shopify-imported orders)
  // can still resolve to a real customer profile by email, read-only, purely for navigation.
  let linkedCustomerId: string | null = order.customer_id;
  if (!linkedCustomerId && order.email) {
    const { data: matchedCustomer } = await supabase.from("customers").select("id").ilike("email", order.email).maybeSingle();
    linkedCustomerId = matchedCustomer?.id ?? null;
  }

  const unfulfilledItems = (items ?? [])
    .filter((i) => i.quantity - i.fulfilled_quantity > 0)
    .map((i) => ({ id: i.id, title: i.title, sku: i.sku, remaining: i.quantity - i.fulfilled_quantity }));
  const returnableItems = (items ?? []).map((i) => ({ id: i.id, title: i.title, quantity: i.quantity }));
  const alreadyRefunded = (refunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const refundableAmount = Math.max(0, Number(order.total_price) - alreadyRefunded);

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
        <div className="flex items-center gap-3">
          <Link href={`/admin/print/orders/${order.id}/packing-slip`} target="_blank" className="text-xs font-medium text-gray-500 underline hover:text-gray-900">
            Skriv ut följesedel
          </Link>
          <span
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              provider === "Shopify" ? "bg-gray-100 text-gray-700" : provider === "Stripe" ? "bg-gray-900 text-white" : "text-gray-400"
            }`}
          >
            {provider}
          </span>
        </div>
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

          {!order.cancelled_at && <FulfillmentForm orderId={order.id} items={unfulfilledItems} />}
          <ReturnForm orderId={order.id} items={returnableItems} />
          <OrderActivityTimeline orderId={order.id} />
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
            {!order.cancelled_at && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <CancelOrderButton orderId={order.id} />
              </div>
            )}
          </div>

          <RefundForm orderId={order.id} maxAmount={refundableAmount} currency={order.currency_code} />

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Kund</div>
            {linkedCustomerId ? (
              <Link href={`/admin/customers/${linkedCustomerId}`} className="text-sm font-medium text-gray-900 hover:underline">
                {customerName || "Visa kundprofil"}
              </Link>
            ) : (
              <div className="text-sm text-gray-900">{customerName || "Gäst"}</div>
            )}
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

          <OrderNotesCard orderId={order.id} initialNote={order.note} initialTags={order.tags ?? []} />
        </div>
      </div>
    </div>
  );
}
