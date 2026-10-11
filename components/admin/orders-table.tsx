"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkFulfillOrders } from "@/app/admin/(authenticated)/orders/actions/bulk-fulfillment";

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
  customerName: string | null;
};

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return "—";
  return `${Math.round(amount)} ${currency}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

const PROVIDER_LABEL: Record<OrderRow["source"], string> = { shopify: "Shopify", stripe: "Stripe", manual: "Manuell" };

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
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

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
          <span className="text-gray-700">{selected.size} valda</span>
          <button
            type="button"
            onClick={bulkFulfill}
            disabled={isPending}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? "Levererar…" : "Fulfillera valda"}
          </button>
        </div>
      )}
      {message && <div className="mb-3 text-xs text-gray-500">{message}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
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
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium text-gray-900 hover:underline">
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                <td className="px-5 py-3 text-gray-500">{o.customerName || o.email || "—"}</td>
                <td className="px-5 py-3 text-gray-900">{formatMoney(o.total_price, o.currency_code)}</td>
                <td className="px-5 py-3 text-gray-500">{o.financial_status || "—"}</td>
                <td className="px-5 py-3 text-gray-500">{o.fulfillment_status || "—"}</td>
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
            ))}
          </tbody>
        </table>

        {orders.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga ordrar hittades.</p>}
      </div>
    </div>
  );
}
