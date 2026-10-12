"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hideOrders, unhideOrders } from "@/app/admin/(authenticated)/orders/actions/hide";

export function OrderHideButton({ orderId, hidden }: { orderId: string; hidden: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    if (hidden) {
      startTransition(async () => {
        const result = await unhideOrders([orderId]);
        if (!result.ok) setError(result.error);
        else router.refresh();
      });
      return;
    }
    if (!confirm("Ta bort denna order från den vanliga listan? Den kan återställas senare -- inget betalnings- eller bokföringsdata påverkas.")) return;
    startTransition(async () => {
      const result = await hideOrders([orderId]);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className={`text-xs font-medium underline hover:no-underline disabled:opacity-50 ${hidden ? "text-gray-500" : "text-rose-600"}`}
      >
        {isPending ? "Arbetar…" : hidden ? "Återställ order" : "Ta bort order"}
      </button>
      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
