"use client";

import { useState, useTransition } from "react";
import { cancelOrder } from "@/app/admin/(authenticated)/orders/[id]/actions/cancellation";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(force: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId, reason, force);
      if (result.ok) {
        setOpen(false);
      } else if (result.needsConfirmation) {
        setNeedsConfirmation(true);
        setError(result.error);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-rose-600 underline hover:text-rose-700">
        Avbryt order
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Avbryt order</div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Anledning (valfritt)"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
      <div className="mt-3 flex gap-2">
        {!needsConfirmation ? (
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={isPending}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? "Avbryter…" : "Avbryt order"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isPending}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? "Avbryter…" : "Avbryt trots leverans"}
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm text-gray-500 hover:text-gray-900">
          Stäng
        </button>
      </div>
    </div>
  );
}
