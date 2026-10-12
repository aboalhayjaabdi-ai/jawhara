"use client";

import { useState, useTransition } from "react";
import { createFulfillment } from "@/app/admin/(authenticated)/orders/[id]/actions/fulfillment";

type UnfulfilledItem = { id: string; title: string; sku: string | null; remaining: number };

export function FulfillmentForm({ orderId, items }: { orderId: string; items: UnfulfilledItem[] }) {
  const [selected, setSelected] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.remaining]))
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.id, true])));
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCompany, setTrackingCompany] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const lines = items.filter((i) => checked[i.id] && selected[i.id] > 0).map((i) => ({ orderItemId: i.id, quantity: selected[i.id] }));
    if (lines.length === 0) {
      setError("Välj minst en artikel.");
      return;
    }
    startTransition(async () => {
      const result = await createFulfillment(orderId, {
        items: lines,
        trackingNumber: trackingNumber || undefined,
        trackingCompany: trackingCompany || undefined,
        notifyCustomer,
      });
      if (!result.ok) setError(result.error);
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Skapa leverans</div>
      <div className="space-y-2">
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={checked[item.id]}
              onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="flex-1 text-gray-900">
              {item.title} {item.sku && <span className="text-gray-400">({item.sku})</span>}
            </span>
            <input
              type="number"
              min={0}
              max={item.remaining}
              value={selected[item.id]}
              onChange={(e) => setSelected((s) => ({ ...s, [item.id]: Math.min(item.remaining, Math.max(0, Number(e.target.value))) }))}
              className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm"
            />
            <span className="w-16 text-xs text-gray-400">av {item.remaining}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Spårningsnummer"
          className="rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={trackingCompany}
          onChange={(e) => setTrackingCompany(e.target.value)}
          placeholder="Transportör (valfritt)"
          className="rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-400">
        Kunden får en spårningslänk till Jawhara direkt -- ingen transportör krävs för att spara.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
        Meddela kund via e-post
      </label>

      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Skapar leverans…" : "Markera som levererad"}
      </button>
    </div>
  );
}
