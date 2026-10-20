"use client";

import { useState, useTransition } from "react";
import { editFulfillmentTracking, cancelFulfillment } from "@/app/admin/(authenticated)/orders/[id]/actions/fulfillment-edit";

export function FulfillmentEditControls({
  fulfillmentId,
  orderId,
  currentTrackingNumber,
  currentTrackingUrl,
}: {
  fulfillmentId: string;
  orderId: string;
  currentTrackingNumber: string | null;
  currentTrackingUrl: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "editing">("idle");
  const [trackingNumber, setTrackingNumber] = useState(currentTrackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(currentTrackingUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitEdit() {
    setError(null);
    startTransition(async () => {
      const result = await editFulfillmentTracking(fulfillmentId, orderId, { trackingNumber, trackingUrl: trackingUrl || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("idle");
    });
  }

  function submitCancel() {
    if (!confirm("Avbryta den här leveransen? Artiklarna blir markerade som ej levererade igen.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelFulfillment(fulfillmentId, orderId);
      if (!result.ok) setError(result.error);
    });
  }

  if (mode === "editing") {
    return (
      <div className="mt-2 space-y-1.5">
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Spårningsnummer"
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
        <input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="Spårningslänk (valfritt)"
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
        />
        {error && <div className="text-xs text-rose-600">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending || !trackingNumber.trim()}
            className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Sparar..." : "Spara"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600">
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-3">
      <button type="button" onClick={() => setMode("editing")} className="text-xs text-gray-500 underline">
        Redigera spårning
      </button>
      <button type="button" onClick={submitCancel} disabled={isPending} className="text-xs text-rose-600 underline disabled:opacity-50">
        {isPending ? "Avbryter..." : "Avbryt leverans"}
      </button>
      {error && <div className="text-xs text-rose-600">{error}</div>}
    </div>
  );
}
