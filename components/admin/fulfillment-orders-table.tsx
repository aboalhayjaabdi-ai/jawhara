"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AdminLocale } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";
import { bulkFulfillOrders } from "@/app/admin/(authenticated)/orders/actions/bulk-fulfillment";

export type FulfillmentOrderRow = {
  id: string;
  order_number: string;
  created_at: string;
  fulfillment_status: string | null;
  customerName: string | null;
  isTestOrder?: boolean;
};

const STATUS_KEY: Record<string, "orders.status.FULFILLED" | "orders.status.PARTIALLY_FULFILLED" | "orders.status.UNFULFILLED"> = {
  FULFILLED: "orders.status.FULFILLED",
  PARTIALLY_FULFILLED: "orders.status.PARTIALLY_FULFILLED",
  IN_PROGRESS: "orders.status.PARTIALLY_FULFILLED",
  UNFULFILLED: "orders.status.UNFULFILLED",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * View-only order list for the restricted "fulfillment_staff" role (see lib/admin/permissions.ts)
 * -- no price/payment/email columns (same "hide payment details and unnecessary personal
 * information" rule the order detail page's own fulfillment_staff branch follows), and the only
 * mutation available is bulk fulfillment, reusing the exact same Server Action the full admin
 * table's "Fulfillera valda" button calls.
 */
export function FulfillmentOrdersTable({ orders, locale, returnQuery }: { orders: FulfillmentOrderRow[]; locale: AdminLocale; returnQuery: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    startTransition(async () => {
      const result = await bulkFulfillOrders(Array.from(selected));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-gray-900 px-4 py-2 text-xs text-white">
          <span>
            {selected.size} {t(locale, "orders.selected")}
          </span>
          <button type="button" onClick={bulkFulfill} disabled={isPending} className="rounded-md bg-white px-3 py-1 font-medium text-gray-900 disabled:opacity-50">
            {t(locale, "orders.bulkFulfill")}
          </button>
        </div>
      )}
      {error && <div className="mb-3 text-sm text-rose-600">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="w-10 px-4 py-3"></th>
              <th className="px-4 py-3">{t(locale, "orders.col.order")}</th>
              <th className="px-4 py-3">{t(locale, "orders.col.date")}</th>
              <th className="px-4 py-3">{t(locale, "orders.col.customer")}</th>
              <th className="px-4 py-3">{t(locale, "orders.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}?from=${encodeURIComponent(returnQuery)}`} prefetch={false} className="flex items-center gap-1.5 font-medium text-gray-900 hover:underline">
                    {o.order_number}
                    {o.isTestOrder && (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        Testorder
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                <td className="px-4 py-3 text-gray-500">{o.customerName || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{STATUS_KEY[o.fulfillment_status ?? ""] ? t(locale, STATUS_KEY[o.fulfillment_status ?? ""]) : t(locale, "orders.status.UNFULFILLED")}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-400" colSpan={5}>
                  {t(locale, "orders.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
