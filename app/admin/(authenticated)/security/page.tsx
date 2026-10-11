"use client";

import { useEffect, useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase/browser-auth";

type Factor = { id: string; friendly_name?: string | null; status: string; factor_type: string };

export default function AdminSecurityPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshFactors() {
    const supabase = createAuthBrowserClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  }

  useEffect(() => {
    refreshFactors();
  }, []);

  async function startEnroll() {
    setError(null);
    setMessage(null);
    const supabase = createAuthBrowserClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Jawhara admin ${new Date().toLocaleDateString("sv-SE")}` });
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    setPendingFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  }

  async function confirmEnroll() {
    setError(null);
    const supabase = createAuthBrowserClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId! });
    if (challengeError) {
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: pendingFactorId!, challengeId: challenge.id, code });
    if (verifyError) {
      setError("Fel kod. Kontrollera att klockan i din autentiseringsapp är korrekt och försök igen.");
      return;
    }
    setMessage("Tvåfaktorsautentisering är nu aktiverad för ditt konto.");
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setCode("");
    refreshFactors();
  }

  async function cancelEnroll() {
    if (pendingFactorId) {
      const supabase = createAuthBrowserClient();
      await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
    }
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setCode("");
    setPendingFactorId(null);
  }

  async function removeFactor(factorId: string) {
    const supabase = createAuthBrowserClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    if (unenrollError) setError(unenrollError.message);
    else {
      setMessage("Tvåfaktorsautentisering borttagen.");
      refreshFactors();
    }
  }

  const hasVerifiedFactor = factors.some((f) => f.status === "verified");

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Säkerhet</h1>
      <p className="mb-6 text-xs text-gray-500">Hantera tvåfaktorsautentisering (TOTP) för ditt eget konto.</p>

      {loading ? (
        <p className="text-sm text-gray-400">Laddar…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Tvåfaktorsautentisering</div>

            {factors.filter((f) => f.status === "verified").map((f) => (
              <div key={f.id} className="mb-2 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-800">✓ {f.friendly_name ?? "Autentiseringsapp"} -- aktiv</span>
                <button type="button" onClick={() => removeFactor(f.id)} className="text-xs text-rose-600 underline hover:text-rose-700">
                  Ta bort
                </button>
              </div>
            ))}

            {!hasVerifiedFactor && !enrolling && (
              <>
                <p className="mb-3 text-sm text-gray-600">
                  Lägg till ett extra säkerhetslager: efter ditt lösenord krävs även en 6-siffrig kod från en autentiseringsapp
                  (t.ex. Google Authenticator, 1Password eller Authy) för att logga in.
                </p>
                <button type="button" onClick={startEnroll} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                  Aktivera tvåfaktorsautentisering
                </button>
              </>
            )}

            {enrolling && qrCode && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Skanna QR-koden med din autentiseringsapp, eller ange nyckeln manuellt.</p>
                <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: qrCode }} />
                {secret && (
                  <div className="rounded-md bg-gray-50 p-2 text-center font-mono text-xs text-gray-600 select-all">{secret}</div>
                )}
                <div>
                  <label className="text-xs text-gray-500">Ange den 6-siffriga koden från appen för att bekräfta</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    placeholder="123456"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={confirmEnroll} disabled={code.length !== 6} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    Bekräfta
                  </button>
                  <button type="button" onClick={cancelEnroll} className="text-xs text-gray-500">
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
            {message && <div className="mt-3 text-sm text-emerald-600">{message}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
