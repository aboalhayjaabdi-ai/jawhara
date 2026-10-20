import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { requireAdmin } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";
import { parseOrdersListFilters, resolveCarrierOrderIds, getAdjacentOrderIds } from "@/lib/admin/orders-filters";
import { financialStatusLabel, fulfillmentStatusLabel, STATUS_TONE_CLASSES } from "@/lib/admin/order-status-labels";
import { OrderNotesCard } from "@/components/admin/order-notes-card";
import { FulfillmentForm } from "@/components/admin/fulfillment-form";
import { FulfillmentEditControls } from "@/components/admin/fulfillment-edit-controls";
import { RefundForm } from "@/components/admin/refund-form";
import { CancelOrderButton } from "@/components/admin/cancel-order-button";
import { OrderHideButton } from "@/components/admin/order-hide-button";
import { ReturnForm } from "@/components/admin/return-form";
import { OrderActivityTimeline } from "@/components/admin/order-activity-timeline";
import { getOrderItemImages } from "@/lib/order-images";
import { normalizeVariantTitle } from "@/lib/variant-title";

export const dynamic = "force-dynamic";

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${Math.round(amount)} ${currency}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FULFILLMENT_STATUS_LABEL: Record<string, "orders.status.FULFILLED" | "orders.status.PARTIALLY_FULFILLED" | "orders.status.UNFULFILLED"> = {
  FULFILLED: "orders.status.FULFILLED",
  PARTIALLY_FULFILLED: "orders.status.PARTIALLY_FULFILLED",
  UNFULFILLED: "orders.status.UNFULFILLED",
};

export default async function AdminOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const admin = await requireAdmin();
  const isFulfillmentStaff = admin.role === "fulfillment_staff";
  const locale = admin.locale;
  const supabase = await createAuthServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, email, phone, currency_code, financial_status, fulfillment_status, subtotal_price, total_shipping, total_tax, total_discounts, total_price, note, tags, cancelled_at, cancel_reason, processed_at, created_at, shopify_id, stripe_checkout_session_id, source, shipping_address_id, customer_id, hidden_at, customers(first_name, last_name, email, phone)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();
  const orderId = order.id;

  const [{ data: items }, { data: payments }, { data: fulfillments }, { data: refunds }, { data: shippingAddress }] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "id, title, sku, quantity, unit_price, discounted_unit_price, fulfilled_quantity, refunded_quantity, variant_id, product_id, image_url, image_is_variant_specific, variant_title_snapshot, product_variants(title)"
      )
      .eq("order_id", order.id),
    supabase.from("payments").select("id, kind, status, gateway, amount, currency_code, processed_at, stripe_payment_intent_id").eq("order_id", order.id),
    supabase
      .from("fulfillments")
      .select(
        "id, status, tracking_number, tracking_url, tracking_company, created_at, shopify_id, shopify_fulfillment_id, shopify_sync_error, tracking_cache(tracking_api_registered_at)"
      )
      .eq("order_id", order.id),
    supabase.from("refunds").select("id, amount, reason, created_at, kind").eq("order_id", order.id),
    order.shipping_address_id
      ? supabase
          .from("addresses")
          .select("first_name, last_name, address1, address2, city, province, zip, country, phone")
          .eq("id", order.shipping_address_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Prefers each item's immutable snapshot (frozen at order-sync time, see migration 0041) --
  // only items synced before that mechanism existed (image_url never populated) fall back to a
  // live lookup, so this page always shows exactly what every transactional email for the same
  // order item shows (lib/email/build-line-items.ts uses the identical preference order).
  const needingLiveLookup = (items ?? []).filter((i) => i.image_url == null);
  const liveImages = needingLiveLookup.length
    ? await getOrderItemImages(needingLiveLookup.map((i) => ({ id: i.id, variantId: i.variant_id, productId: i.product_id })))
    : {};
  const itemImages: Record<string, { imageUrl: string | null; isVariantSpecific: boolean }> = {};
  for (const i of items ?? []) {
    itemImages[i.id] =
      i.image_url != null ? { imageUrl: i.image_url, isVariantSpecific: !!i.image_is_variant_specific } : liveImages[i.id] ?? { imageUrl: null, isVariantSpecific: false };
  }

  const currencyCode = order.currency_code;
  const customer = order.customers as any;
  const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : null;
  const provider = order.source === "shopify" ? "Shopify" : order.source === "stripe" ? "Stripe" : "Manuell";

  // Guest orders (the vast majority -- customer_id is only ever set for Shopify-imported orders)
  // can still resolve to a real customer profile by email, read-only, purely for navigation. Not
  // offered to fulfillment_staff (no customer-section access), so skip the extra query for it.
  let linkedCustomerId: string | null = order.customer_id;
  if (!isFulfillmentStaff && !linkedCustomerId && order.email) {
    const { data: matchedCustomer } = await supabase.from("customers").select("id").ilike("email", order.email).maybeSingle();
    linkedCustomerId = matchedCustomer?.id ?? null;
  }

  const unfulfilledItems = (items ?? [])
    .filter((i) => i.quantity - i.fulfilled_quantity > 0)
    .map((i) => ({ id: i.id, title: i.title, sku: i.sku, remaining: i.quantity - i.fulfilled_quantity }));
  const returnableItems = (items ?? []).map((i) => ({ id: i.id, title: i.title, quantity: i.quantity }));
  const alreadyRefunded = (refunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const refundableAmount = Math.max(0, Number(order.total_price) - alreadyRefunded);
  const backHref = from ? `/admin/orders?${from}` : "/admin/orders";

  // Up/down prev-next navigation, respecting the same filters/sort the admin was viewing the list
  // under (carried via `from`) -- so paging through orders from a filtered/sorted view stays
  // consistent with what's actually above/below the current order in that same list.
  const listFilters = parseOrdersListFilters(from ? Object.fromEntries(new URLSearchParams(from)) : {});
  if (isFulfillmentStaff) {
    listFilters.view = "active";
    listFilters.carrier = undefined;
    listFilters.provider = undefined;
  }
  const carrierOrderIds = listFilters.carrier ? await resolveCarrierOrderIds(listFilters.carrier) : undefined;
  const { prevId, nextId } = await getAdjacentOrderIds(order.id, listFilters, carrierOrderIds);
  const navHref = (targetId: string) => `/admin/orders/${targetId}${from ? `?from=${encodeURIComponent(from)}` : ""}`;

  const fulfillmentLabel = fulfillmentStatusLabel(order.fulfillment_status);
  const financialLabel = financialStatusLabel(order.financial_status, order.cancelled_at);

  // Shared top-right icon row: up/down to the previous/next order in the current list context,
  // plus (full admin only) the packing-slip print icon. Both branches render the exact same arrows.
  function OrderNavIcons() {
    return (
      <div className="flex items-center gap-1">
        {!isFulfillmentStaff && (
          <Link
            href={`/admin/print/orders/${orderId}/packing-slip`}
            target="_blank"
            aria-label="Skriv ut följesedel"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </Link>
        )}
        {prevId ? (
          <Link href={navHref(prevId)} aria-label="Föregående order" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </Link>
        ) : (
          <span aria-hidden className="rounded-md p-1.5 text-gray-200">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        )}
        {nextId ? (
          <Link href={navHref(nextId)} aria-label="Nästa order" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Link>
        ) : (
          <span aria-hidden className="rounded-md p-1.5 text-gray-200">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
      </div>
    );
  }

  // Shared by both the full admin view and the fulfillment_staff view: the product image/title are
  // clickable, carrying the exact purchased variant through to the product page (?variant=<id>) so
  // the right color/size row is highlighted there rather than just landing on the product generically.
  // A deleted product (order_items.product_id is set null on delete, never cascaded) renders the
  // same info as plain text instead of a dead link.
  function ItemRow({ item, showPrice }: { item: NonNullable<typeof items>[number]; showPrice: boolean }) {
    const variantTitle = normalizeVariantTitle(item.variant_title_snapshot ?? (item.product_variants as any)?.title);
    const image = itemImages[item.id];
    const href = item.product_id ? `/admin/products/${item.product_id}${item.variant_id ? `?variant=${item.variant_id}` : ""}` : null;
    const thumb = (
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
        {image?.imageUrl ? (
          <Image src={image.imageUrl} alt={item.title} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-gray-400">{t(locale, "order.noImage")}</div>
        )}
      </div>
    );
    const info = (
      <div>
        <div className="font-medium text-gray-900">{item.title}</div>
        {variantTitle && <div className="text-xs text-gray-500">{variantTitle}</div>}
        {item.sku && <div className="text-xs text-gray-400">{item.sku}</div>}
        {!href && <div className="mt-0.5 text-xs italic text-gray-400">{t(locale, "order.productDeleted")}</div>}
      </div>
    );
    return (
      <tr key={item.id} className="border-b border-gray-100 last:border-0">
        <td className="px-5 py-3">
          {href ? (
            <Link href={href} className="flex items-center gap-4 hover:opacity-80">
              {thumb}
              {info}
            </Link>
          ) : (
            <div className="flex items-center gap-4">
              {thumb}
              {info}
            </div>
          )}
        </td>
        <td className="px-5 py-3 text-right text-gray-500">× {item.quantity}</td>
        {showPrice && (
          <td className="px-5 py-3 text-right font-medium text-gray-900">
            {formatMoney((item.discounted_unit_price ?? item.unit_price) * item.quantity, currencyCode)}
          </td>
        )}
      </tr>
    );
  }

  if (isFulfillmentStaff) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <Link href={backHref} aria-label={t(locale, "order.back")} className="flex items-center gap-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <OrderNavIcons />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">{order.order_number}</h1>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[fulfillmentLabel.tone]}`}>
              {FULFILLMENT_STATUS_LABEL[order.fulfillment_status ?? ""] ? t(locale, FULFILLMENT_STATUS_LABEL[order.fulfillment_status ?? ""]) : fulfillmentLabel.label}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-500">{formatDate(order.created_at)}</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t(locale, "order.items")}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {(items ?? []).map((item) => <ItemRow key={item.id} item={item} showPrice={false} />)}
                  {(items ?? []).length === 0 && (
                    <tr>
                      <td className="px-5 py-6 text-center text-sm text-gray-400" colSpan={2}>
                        {t(locale, "order.noItems")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {(fulfillments ?? []).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t(locale, "order.shipments")}
                </div>
                <div className="divide-y divide-gray-100">
                  {(fulfillments ?? []).map((f) => (
                    <div key={f.id} className="px-5 py-3 text-sm">
                      <div className="font-medium text-gray-900">{FULFILLMENT_STATUS_LABEL[f.status] ? t(locale, FULFILLMENT_STATUS_LABEL[f.status]) : f.status || "—"}</div>
                      {f.tracking_number && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {f.tracking_company ? `${f.tracking_company}: ` : ""}
                          {f.tracking_number}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!order.cancelled_at ? (
              <FulfillmentForm orderId={order.id} items={unfulfilledItems} locale={locale} />
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">{t(locale, "order.alreadyCancelled")}</div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "order.fulfillmentStatus")}</div>
              <div className="text-sm font-medium text-gray-900">
                {FULFILLMENT_STATUS_LABEL[order.fulfillment_status ?? ""] ? t(locale, FULFILLMENT_STATUS_LABEL[order.fulfillment_status ?? ""]) : order.fulfillment_status || "—"}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "order.customer")}</div>
              <div className="text-sm text-gray-900">{customerName || t(locale, "order.guest")}</div>
              {(customer?.phone ?? order.phone) && (
                <div className="mt-2 text-sm text-gray-500">
                  <span className="text-xs uppercase tracking-wide text-gray-400">{t(locale, "order.phone")}: </span>
                  {customer?.phone ?? order.phone}
                </div>
              )}
            </div>

            {shippingAddress && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "order.shippingAddress")}</div>
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
                  {shippingAddress.phone && <div className="mt-1 text-gray-500">{shippingAddress.phone}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Link href={backHref} aria-label="Tillbaka till ordrar" className="flex items-center gap-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden text-xs uppercase tracking-wide lg:inline">Ordrar</span>
          </Link>
          <OrderNavIcons />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">{order.order_number}</h1>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[fulfillmentLabel.tone]}`}>{fulfillmentLabel.label}</span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[financialLabel.tone]}`}>{financialLabel.label}</span>
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
              provider === "Shopify" ? "bg-gray-100 text-gray-700" : provider === "Stripe" ? "bg-gray-900 text-white" : "text-gray-400"
            }`}
          >
            {provider}
          </span>
        </div>
        <div className="mt-1 text-sm text-gray-500">{formatDate(order.created_at)}</div>
        {order.hidden_at && (
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-600">Borttagen från listan</div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Artiklar
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(items ?? []).map((item) => <ItemRow key={item.id} item={item} showPrice />)}
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
                    {f.tracking_number && (
                      <div className="mt-1 text-xs text-gray-400">
                        {(f as any).tracking_cache?.tracking_api_registered_at
                          ? "Registrerad hos 17TRACK"
                          : "Inte registrerad hos 17TRACK (ej konfigurerat)"}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-gray-400">
                      {f.shopify_id
                        ? "Synkad till Shopify"
                        : f.shopify_sync_error
                          ? `Shopify-synk misslyckades: ${f.shopify_sync_error}`
                          : order.source === "shopify"
                            ? "Inte synkad till Shopify"
                            : null}
                    </div>
                    {f.status !== "CANCELLED" && (
                      <FulfillmentEditControls
                        fulfillmentId={f.id}
                        orderId={order.id}
                        currentTrackingNumber={f.tracking_number}
                        currentTrackingUrl={f.tracking_url}
                      />
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

          {!order.cancelled_at && <FulfillmentForm orderId={order.id} items={unfulfilledItems} locale={locale} />}
          <ReturnForm orderId={order.id} items={returnableItems} />
          <OrderActivityTimeline orderId={order.id} />
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Betalning</span>
                <span className="font-medium text-gray-900">{financialLabel.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Leverans</span>
                <span className="font-medium text-gray-900">{fulfillmentLabel.label}</span>
              </div>
              {order.cancelled_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Avbruten</span>
                  <span className="font-medium text-gray-900">{formatDate(order.cancelled_at)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3">
              {!order.cancelled_at && <CancelOrderButton orderId={order.id} />}
              <OrderHideButton orderId={order.id} hidden={!!order.hidden_at} />
            </div>
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
