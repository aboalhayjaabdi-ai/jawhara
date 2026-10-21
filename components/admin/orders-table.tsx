"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkFulfillOrders } from "@/app/admin/(authenticated)/orders/actions/bulk-fulfillment";
import { hideOrders, unhideOrders } from "@/app/admin/(authenticated)/orders/actions/hide";
import { financialStatusLabel, fulfillmentStatusLabel, STATUS_TONE_CLASSES } from "@/lib/admin/order-status-labels";

export type OrderRow = {
  id: string;
  order_number: string;
  created_at: string;
  email: string | null;
  total_price: number;
  currency_code: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  source: "shopify" | "stripe" | "manual";
  cancelled_at?: string | null;
  customerName: string | null;
  itemCount?: number;
  carrier?: string | null;
  isTestOrder?: boolean;
};

function TestOrderBadge() {
  return (
    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
      Testorder
    </span>
  );
}

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${Math.round(amount)} ${currency}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

const PROVIDER_LABEL: Record<OrderRow["source"], string> = { shopify: "Shopify", stripe: "Stripe", manual: "Manuell" };

export function OrdersTable({ orders, viewingHidden = false, returnQuery = "" }: { orders: OrderRow[]; viewingHidden?: boolean; returnQuery?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkFulfill() {
    setMessage(null);
    startTransition(async () => {
      const result = await bulkFulfillOrders(Array.from(selected));
      if (result.ok) {
        setMessage(`${result.fulfilled} order(er) levererade${result.skipped.length ? `, ${result.skipped.length} hoppades över` : ""}.`);
        setSelected(new Set());
      } else {
        setMessage(result.error);
      }
    });
  }

  function bulkHide() {
    if (!confirm(`Ta bort ${selected.size} order(er) från den vanliga listan? De kan återställas senare -- inget betalnings- eller bokföringsdata påverkas.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await hideOrders(Array.from(selected));
      if (result.ok) {
        setMessage(`${result.count} order(er) borttagna från listan.`);
        setSelected(new Set());
      } else {
        setMessage(result.error);
      }
    });
  }

  function bulkUnhide() {
    setMessage(null);
    startTransition(async () => {
      const result = await unhideOrders(Array.from(selected));
      if (result.ok) {
        setMessage(`${result.count} order(er) återställda.`);
        setSelected(new Set());
      } else {
        setMessage(result.error);
      }
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
          <span className="text-gray-700">{selected.size} valda</span>
          <div className="flex gap-2">
            {!viewingHidden && (
              <button
                type="button"
                onClick={bulkFulfill}
                disabled={isPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isPending ? "Levererar…" : "Fulfillera valda"}
              </button>
            )}
            <a
              href={`/api/admin/orders/export?ids=${Array.from(selected).join(",")}`}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Exportera valda
            </a>
            {viewingHidden ? (
              <button
                type="button"
                onClick={bulkUnhide}
                disabled={isPending}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {isPending ? "Återställer…" : "Återställ valda"}
              </button>
            ) : (
              <button
                type="button"
                onClick={bulkHide}
                disabled={isPending}
                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {isPending ? "Tar bort…" : "Ta bort valda"}
              </button>
            )}
          </div>
        </div>
      )}
      {message && <div className="mb-3 text-xs text-gray-500">{message}</div>}

      {/* Mobile: a card list resembling the native Shopify Admin app's order list (order number +
          price, "{customer} • {N} artiklar • {time}", status pills, carrier/channel line) -- no
          bulk-select here, that stays a desktop-table feature. Desktop table below is untouched. */}
      <div className="space-y-2 lg:hidden">
        {orders.map((o) => {
          const financial = financialStatusLabel(o.financial_status, o.cancelled_at);
          const fulfillment = fulfillmentStatusLabel(o.fulfillment_status);
          return (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}${returnQuery ? `?from=${encodeURIComponent(returnQuery)}` : ""}`}
              prefetch={false}
              className="block rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 font-semibold text-gray-900">
                  {o.order_number}
                  {o.isTestOrder && <TestOrderBadge />}
                </span>
                <span className="font-semibold text-gray-900">{formatMoney(o.total_price, o.currency_code)}</span>
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {[o.customerName || o.email || "—", `${o.itemCount ?? 0} artiklar`, formatTime(o.created_at)].join(" · ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[fulfillment.tone]}`}>{fulfillment.label}</span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[financial.tone]}`}>{financial.label}</span>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {formatDate(o.created_at)} · {[o.carrier, PROVIDER_LABEL[o.source]].filter(Boolean).join(" · ")}
              </div>
            </Link>
          );
        })}
        {orders.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga ordrar hittades.</p>}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={orders.length > 0 && selected.size === orders.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(orders.map((o) => o.id)) : new Set())}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
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
            {orders.map((o) => {
              const financial = financialStatusLabel(o.financial_status, o.cancelled_at);
              const fulfillment = fulfillmentStatusLabel(o.fulfillment_status);
              return (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/orders/${o.id}${returnQuery ? `?from=${encodeURIComponent(returnQuery)}` : ""}`}
                    prefetch={false}
                    className="flex items-center gap-1.5 font-medium text-gray-900 hover:underline"
                  >
                    {o.order_number}
                    {o.isTestOrder && <TestOrderBadge />}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                <td className="px-5 py-3 text-gray-500">{o.customerName || o.email || "—"}</td>
                <td className="px-5 py-3 text-gray-900">{formatMoney(o.total_price, o.currency_code)}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[financial.tone]}`}>{financial.label}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[fulfillment.tone]}`}>{fulfillment.label}</span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      o.source === "shopify" ? "bg-gray-100 text-gray-700" : o.source === "stripe" ? "bg-gray-900 text-white" : "text-gray-400"
                    }`}
                  >
                    {PROVIDER_LABEL[o.source]}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {orders.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga ordrar hittades.</p>}
      </div>
    </div>
  );
}
