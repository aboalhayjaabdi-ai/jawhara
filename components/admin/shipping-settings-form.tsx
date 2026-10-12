"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateShippingSettings } from "@/app/admin/(authenticated)/settings/shipping/actions";

export function ShippingSettingsForm({ initialCountries, initialFlatRate }: { initialCountries: string[]; initialFlatRate: number }) {
  const router = useRouter();
  const [countriesText, setCountriesText] = useState(initialCountries.join(", "));
  const [flatRate, setFlatRate] = useState(initialFlatRate);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    const countries = countriesText.split(",").map((c) => c.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await updateShippingSettings(countries, flatRate);
      if (result.ok) {
        setMessage("Sparat.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fraktinställningar</div>
      <div>
        <label className="text-xs text-gray-500">Länder som levereras till (kommaseparerade tvåbokstavskoder)</label>
        <input value={countriesText} onChange={(e) => setCountriesText(e.target.value)} placeholder="SE, DK, NO" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-500">Fraktpris (kr)</label>
        <input type="number" min={0} step="1" value={flatRate} onChange={(e) => setFlatRate(Number(e.target.value))} className="mt-1 w-32 rounded-md border border-gray-200 px-3 py-2 text-sm" />
        <p className="mt-1 text-xs text-gray-400">Dagens verkliga värde: 0 kr, alltid fri frakt.</p>
      </div>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      {message && <div className="text-sm text-emerald-600">{message}</div>}
      <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
