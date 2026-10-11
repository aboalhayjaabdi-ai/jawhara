"use client";

import { useState, useTransition } from "react";
import { adjustVariantInventory } from "@/app/admin/(authenticated)/products/[id]/actions/inventory";

const REASON_LABEL: Record<string, string> = {
  received_stock: "Mottagit lager",
  damaged: "Skadat/kasserat",
  correction: "Rättelse",
  manual_adjustment: "Övrigt",
};

export function InventoryAdjustButton({
  productId,
  variantId,
  currentQuantity,
  onAdjusted,
}: {
  productId: string;
  variantId: string;
  currentQuantity: number;
  onAdjusted: (newQuantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "delta">("delta");
  const [value, setValue] = useState("0");
  const [reason, setReason] = useState<"received_stock" | "damaged" | "correction" | "manual_adjustment">("received_stock");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      setError("Ange ett giltigt tal.");
      return;
    }
    startTransition(async () => {
      const result = await adjustVariantInventory(productId, variantId, { mode, value: numericValue, reason, note: note || undefined });
      if (result.ok) {
        onAdjusted(result.newQuantity);
        setOpen(false);
        setValue("0");
        setNote("");
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-0.5 block text-[10px] text-gray-500 underline hover:text-gray-900">
        Justera lager
      </button>
    );
  }

  return (
    <div className="absolute z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Justera lager (nu: {currentQuantity})</div>
      <div className="mb-2 flex gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "delta"} onChange={() => setMode("delta")} /> Ändra med
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "set"} onChange={() => setMode("set")} /> Sätt till
        </label>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-xs"
        placeholder={mode === "delta" ? "t.ex. 10 eller -5" : "ny mängd"}
      />
      <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-xs">
        {Object.entries(REASON_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anteckning (valfritt)"
        className="mb-2 w-full rounded border border-gray-200 px-2 py-1 text-xs"
      />
      {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-900">
          Avbryt
        </button>
        <button type="button" onClick={submit} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Spara"}
        </button>
      </div>
    </div>
  );
}
