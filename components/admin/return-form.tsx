"use client";

import { useState, useTransition } from "react";
import { createReturn } from "@/app/admin/(authenticated)/orders/[id]/actions/returns";

type ReturnableItem = { id: string; title: string; quantity: number };

export function ReturnForm({ orderId, items }: { orderId: string; items: ReturnableItem[] }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.quantity])));
  const [restock, setRestock] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.id, true])));
  const [resolution, setResolution] = useState<"refund" | "exchange" | "none">("refund");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) return null;

  function submit() {
    setError(null);
    const lines = items.filter((i) => checked[i.id] && qty[i.id] > 0).map((i) => ({ orderItemId: i.id, quantity: qty[i.id], restock: restock[i.id] }));
    if (lines.length === 0) {
      setError("Välj minst en artikel.");
      return;
    }
    startTransition(async () => {
      const result = await createReturn(orderId, { reason: reason || undefined, resolution, items: lines });
      if (result.ok) {
        setDone(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Retur</div>
          {!done && (
            <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
              Registrera retur
            </button>
          )}
        </div>
        {done && <div className="mt-2 text-xs text-emerald-600">Retur registrerad.</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Registrera retur</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!!checked[item.id]}
              onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="flex-1 text-gray-900">{item.title}</span>
            <input
              type="number"
              min={0}
              max={item.quantity}
              value={qty[item.id]}
              onChange={(e) => setQty((q) => ({ ...q, [item.id]: Math.min(item.quantity, Math.max(0, Number(e.target.value))) }))}
              className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={!!restock[item.id]}
                onChange={(e) => setRestock((r) => ({ ...r, [item.id]: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Lägg tillbaka i lager
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select value={resolution} onChange={(e) => setResolution(e.target.value as any)} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
          <option value="refund">Återbetalning</option>
          <option value="exchange">Byte</option>
          <option value="none">Ingen åtgärd</option>
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Anledning (valfritt)"
          className="col-span-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Registrerar…" : "Registrera retur"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm text-gray-500 hover:text-gray-900">
          Avbryt
        </button>
      </div>
      {resolution === "refund" && (
        <p className="mt-3 text-xs text-gray-400">
          Skapa återbetalningen separat i panelen &quot;Återbetalning&quot; ovan efter att returen är registrerad.
        </p>
      )}
    </div>
  );
}
