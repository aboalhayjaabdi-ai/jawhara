"use client";

import { useState, useTransition } from "react";
import { createRefund } from "@/app/admin/(authenticated)/orders/[id]/actions/refunds";

export function RefundForm({ orderId, maxAmount, currency }: { orderId: string; maxAmount: number; currency: string }) {
  const [amount, setAmount] = useState(maxAmount);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ mode: "stripe" | "manual" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (maxAmount <= 0) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createRefund(orderId, { amount, reason: reason || undefined });
      if (res.ok) {
        setResult({ mode: res.mode });
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Återbetalning</div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
            Återbetala
          </button>
        )}
      </div>

      {result && (
        <div className="mb-3 text-xs text-emerald-600">
          {result.mode === "stripe" ? "Återbetalning skickad via Stripe." : "Återbetalning registrerad manuellt (ingen Stripe-betalning fanns att återbetala)."}
        </div>
      )}

      {open && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Belopp ({currency})</label>
            <input
              type="number"
              min={0}
              max={maxAmount}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Math.min(maxAmount, Math.max(0, Number(e.target.value))))}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-gray-400">Max {maxAmount} {currency}</div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Anledning (valfritt)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || amount <= 0}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Bearbetar…" : "Bekräfta återbetalning"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm text-gray-500 hover:text-gray-900">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
