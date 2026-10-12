"use client";

import { useEffect, useState } from "react";
import type { OrderTrackingResult } from "@/lib/tracking/lookup";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Behandlas",
  fulfilled: "Skickad",
  partial: "Delvis skickad",
  // Real values written by app/admin/(authenticated)/orders/[id]/actions/fulfillment.ts and
  // .../orders/actions/bulk-fulfillment.ts -- confirmed, not guessed.
  SUCCESS: "Skickad",
  CANCELLED: "Avbruten",
  ERROR: "Fel",
};

function ShipmentResults({ result }: { result: OrderTrackingResult & { ok: true } }) {
  return (
    <div className="mt-10 border-t border-line pt-8">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide">Order {result.orderNumber}</h2>

      {result.notYetShipped && <p className="text-sm leading-6 text-muted">Din beställning har inte skickats än.</p>}

      {!result.notYetShipped && (
        <div className="flex flex-col gap-6">
          {result.shipments.map((shipment, i) => (
            <div key={shipment.fulfillmentId} className="border border-line p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {result.shipments.length > 1 ? `Paket ${i + 1}` : "Paket"}
                </span>
                <span className="text-xs text-muted">{STATUS_LABELS[shipment.status] ?? shipment.status}</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-sm">
                {shipment.carrier && (
                  <>
                    <dt className="text-muted">Transportör</dt>
                    <dd>{shipment.carrier}</dd>
                  </>
                )}
                {shipment.trackingNumber && (
                  <>
                    <dt className="text-muted">Spårningsnummer</dt>
                    <dd>{shipment.trackingNumber}</dd>
                  </>
                )}
              </dl>

              {shipment.events.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm">
                  {shipment.events.map((ev, j) => (
                    <li key={j} className="flex justify-between gap-4">
                      <span>
                        {ev.description ?? ev.status}
                        {ev.location && <span className="text-muted"> — {ev.location}</span>}
                      </span>
                      <span className="whitespace-nowrap text-muted">{formatDate(ev.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                  {shipment.registered ? "Inga spårningshändelser ännu." : "Detaljerad spårning är inte tillgänglig ännu för detta paket."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrackingLookupForm({ token }: { token?: string }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">(token ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderTrackingResult | null>(null);
  // True once a token lookup has been tried (successfully or not) -- the manual form is shown
  // below the loading state while a token is being verified, and stays available afterward
  // either way, per "keep manual lookup available even when arriving via a link."
  const [tokenChecked, setTokenChecked] = useState(!token);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/tracking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Något gick fel.");
      } else {
        setStatus("idle");
        setResult(data as OrderTrackingResult);
      }
      setTokenChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    setResult(null);

    const res = await fetch("/api/tracking/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, email }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setError(data.error ?? "Något gick fel.");
      return;
    }
    setStatus("idle");
    setResult(data as OrderTrackingResult);
  }

  if (token && !tokenChecked) {
    return <p className="text-sm text-muted">Hämtar din beställning…</p>;
  }

  return (
    <div>
      {token && result?.ok && <ShipmentResults result={result} />}

      {/* Manual lookup: always available, per the requirement that a direct visitor (or a
          customer whose link expired) can still search by order number + email. */}
      {(!token || !result?.ok) && (
        <>
          {token && error && <p className="mb-6 text-sm leading-6 text-muted">{error}</p>}
          <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="orderNumber" className="text-xs uppercase tracking-wide text-muted">
                Ordernummer *
              </label>
              <input
                id="orderNumber"
                name="orderNumber"
                type="text"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="h-11 border border-line px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs uppercase tracking-wide text-muted">
                E-postadress *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border border-line px-3 text-sm"
              />
            </div>
            {status === "error" && error && !token && <p className="text-xs text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={status === "loading"}
              className="mt-2 flex h-12 items-center justify-center bg-fg px-8 text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-50"
            >
              {status === "loading" ? "Söker..." : "Spåra beställning"}
            </button>
          </form>

          {result?.ok && <ShipmentResults result={result} />}
        </>
      )}
    </div>
  );
}
