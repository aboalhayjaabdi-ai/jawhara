"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anonymizeCustomerAction, deleteCustomerAction } from "@/app/admin/(authenticated)/customers/[id]/actions/gdpr";

export function CustomerGdprActions({ customerId, customerLabel, hasOrders }: { customerId: string; customerLabel: string; hasOrders: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "anonymize" | "delete">("none");
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAnonymize() {
    setError(null);
    startTransition(async () => {
      const result = await anonymizeCustomerAction(customerId, true);
      if (result.ok) {
        setMode("none");
        setMessage(result.restricted ? "Personuppgifter anonymiserade. Orderhistoriken bevarades för bokföringsändamål." : "Kunden anonymiserad.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function runDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerAction(customerId, true);
      if (result.ok) {
        router.push("/admin/customers");
      } else {
        setError(result.error);
        if (result.needsAnonymize) setMode("anonymize");
      }
    });
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">GDPR</div>
      <p className="mb-3 text-xs text-rose-700">
        Exportera personuppgifter, anonymisera, eller radera kunden permanent. {hasOrders && "Kunden har orderhistorik som måste bevaras för bokföringsändamål -- radering är inte tillgänglig; använd Anonymisera."}
      </p>

      <a
        href={`/api/admin/customers/${customerId}/export-data`}
        className="mb-3 inline-block text-xs font-medium text-gray-700 underline hover:text-gray-900"
      >
        Exportera personuppgifter (GDPR)
      </a>

      {message && <div className="mb-2 text-xs text-emerald-700">{message}</div>}
      {error && <div className="mb-2 text-xs text-rose-700">{error}</div>}

      {mode === "none" && (
        <div className="flex gap-3">
          <button type="button" onClick={() => setMode("anonymize")} className="text-xs font-medium text-amber-700 underline hover:text-amber-900">
            Anonymisera…
          </button>
          {!hasOrders && (
            <button type="button" onClick={() => setMode("delete")} className="text-xs font-medium text-rose-700 underline hover:text-rose-900">
              Radera permanent…
            </button>
          )}
        </div>
      )}

      {mode !== "none" && (
        <div className="space-y-2">
          <label className="text-xs text-rose-700">
            Skriv <strong>{customerLabel}</strong> för att bekräfta
          </label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full rounded-md border border-rose-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={mode === "anonymize" ? runAnonymize : runDelete}
              disabled={isPending || confirmText !== customerLabel}
              className={`rounded-md px-3 py-2 text-xs font-medium text-white disabled:opacity-50 ${mode === "anonymize" ? "bg-amber-600 hover:bg-amber-700" : "bg-rose-600 hover:bg-rose-700"}`}
            >
              {mode === "anonymize" ? "Anonymisera permanent" : "Radera permanent"}
            </button>
            <button type="button" onClick={() => setMode("none")} className="text-xs text-gray-500 hover:text-gray-900">
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
