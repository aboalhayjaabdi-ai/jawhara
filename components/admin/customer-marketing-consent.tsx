"use client";

import { useState, useTransition } from "react";
import { updateMarketingConsent } from "@/app/admin/(authenticated)/customers/[id]/actions/core";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CustomerMarketingConsent({
  customerId,
  initialAccepts,
  consentUpdatedAt,
  isNewsletterSubscriber,
}: {
  customerId: string;
  initialAccepts: boolean;
  consentUpdatedAt: string | null;
  isNewsletterSubscriber: boolean;
}) {
  const [accepts, setAccepts] = useState(initialAccepts);
  const [updatedAt, setUpdatedAt] = useState(consentUpdatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    const next = !accepts;
    startTransition(async () => {
      const result = await updateMarketingConsent(customerId, next);
      if (result.ok) {
        setAccepts(next);
        setUpdatedAt(new Date().toISOString());
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Marknadsföringssamtycke</div>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${accepts ? "text-emerald-600" : "text-gray-500"}`}>{accepts ? "Godkänner marknadsföring" : "Godkänner inte"}</span>
        <button type="button" onClick={toggle} disabled={isPending} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {accepts ? "Dra tillbaka samtycke" : "Markera som godkänt"}
        </button>
      </div>
      {updatedAt && <div className="mt-1 text-xs text-gray-400">Senast ändrat: {formatDate(updatedAt)}</div>}
      <div className="mt-2 text-xs text-gray-400">
        Nyhetsbrevsanmälan på webbplatsen: {isNewsletterSubscriber ? "Ja" : "Nej"} (separat lista, inte automatiskt kopplad till kundens samtycke ovan)
      </div>
      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
