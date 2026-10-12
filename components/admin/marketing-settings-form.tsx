"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMarketingSettings, updateMetaCapiToken, clearMetaCapiToken } from "@/app/admin/(authenticated)/settings/marketing/actions";

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Aktiv</span>
  ) : (
    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Inaktiv</span>
  );
}

export function MarketingSettingsForm({
  initialPixelId,
  initialGa4Id,
  hasCapiToken,
}: {
  initialPixelId: string;
  initialGa4Id: string;
  hasCapiToken: boolean;
}) {
  const router = useRouter();
  const [pixelId, setPixelId] = useState(initialPixelId);
  const [ga4Id, setGa4Id] = useState(initialGa4Id);
  const [capiToken, setCapiToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(hasCapiToken);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveIds() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMarketingSettings({ metaPixelId: pixelId, ga4MeasurementId: ga4Id });
      if (result.ok) {
        setMessage("Sparat.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function saveToken() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMetaCapiToken(capiToken);
      if (result.ok) {
        setTokenConfigured(!!capiToken.trim());
        setCapiToken("");
        setMessage("Access-token sparad.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function removeToken() {
    if (!confirm("Ta bort den sparade Meta CAPI-token? Server-side-händelser slutar skickas tills en ny token sparas.")) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await clearMetaCapiToken();
      if (result.ok) {
        setTokenConfigured(false);
        setMessage("Token borttagen.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Meta Pixel</div>
          <StatusBadge active={!!pixelId.trim()} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Pixel-ID</label>
          <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="t.ex. 123456789012345" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Google Analytics 4</div>
          <StatusBadge active={!!ga4Id.trim()} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Measurement-ID</label>
          <input value={ga4Id} onChange={(e) => setGa4Id(e.target.value)} placeholder="t.ex. G-XXXXXXXXXX" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>

        {error && <div className="text-sm text-rose-600">{error}</div>}
        {message && <div className="text-sm text-emerald-600">{message}</div>}
        <button type="button" onClick={saveIds} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Spara"}
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Meta Conversions API (server-side)</div>
          <StatusBadge active={tokenConfigured} />
        </div>
        <p className="text-xs text-gray-500">
          En engångs-access-token från Meta Events Manager. Sparas krypterat i databasen och visas aldrig igen i klartext här --
          endast om den är konfigurerad eller inte.
        </p>
        <div>
          <label className="text-xs text-gray-500">{tokenConfigured ? "Ersätt access-token" : "Access-token"}</label>
          <input
            type="password"
            value={capiToken}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder={tokenConfigured ? "•••••••••••••••• (konfigurerad)" : "Klistra in token från Meta Events Manager"}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={saveToken} disabled={isPending || !capiToken.trim()} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            Spara token
          </button>
          {tokenConfigured && (
            <button type="button" onClick={removeToken} disabled={isPending} className="rounded-md border border-gray-200 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              Ta bort token
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
