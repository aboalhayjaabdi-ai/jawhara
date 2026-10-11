"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStoreSettings, updateLogoUrl, type StoreSettingsInput } from "@/app/admin/(authenticated)/settings/actions";
import { ImageUploadField } from "@/components/admin/image-upload-field";

export function StoreSettingsForm({ initial, initialLogoUrl }: { initial: StoreSettingsInput; initialLogoUrl: string | null }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone);
  const [businessAddress, setBusinessAddress] = useState(initial.businessAddress);
  const [vatRatePercent, setVatRatePercent] = useState(initial.vatRatePercent);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateStoreSettings({ businessName, supportEmail, supportPhone, businessAddress, vatRatePercent });
      if (result.ok) {
        setMessage("Sparat.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleLogoChange(url: string) {
    setLogoUrl(url);
    startTransition(async () => {
      const result = await updateLogoUrl(url);
      if (result.ok) {
        setMessage("Logotyp uppdaterad -- syns direkt på webbutiken.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  async function resetLogo() {
    setLogoUrl("");
    startTransition(async () => {
      await updateLogoUrl(null);
      setMessage("Återställt till standardlogotypen.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Varumärke</div>
        <ImageUploadField label="Logotyp (visas i sidhuvudet)" value={logoUrl} onChange={handleLogoChange} endpoint="/api/admin/settings/logo" />
        {logoUrl && (
          <button type="button" onClick={resetLogo} className="text-xs text-gray-500 underline hover:text-gray-900">
            Återställ till standardlogotyp
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Allmänt</div>
        <div>
          <label className="text-xs text-gray-500">Butiksnamn</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Support-e-post</label>
            <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Support-telefon (valfritt)</label>
            <input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Företagsadress (valfritt, för fakturor/kvitton)</label>
          <textarea value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <p className="text-xs text-gray-400">
          Valuta: SEK -- fast värde, används genomgående i kassan och kan inte ändras här utan en större ombyggnad av betalflödet.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Moms</div>
        <div>
          <label className="text-xs text-gray-500">Momssats (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={vatRatePercent}
            onChange={(e) => setVatRatePercent(Number(e.target.value))}
            className="mt-1 w-32 rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Används av kassan för att beräkna moms på ordersumman. Idag satt till 0% (ursprungligt beslut).</p>
        </div>
      </div>

      {message && <div className="text-sm text-emerald-600">{message}</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
