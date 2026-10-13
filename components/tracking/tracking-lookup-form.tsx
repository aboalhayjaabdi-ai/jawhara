"use client";

import { Fragment, useEffect, useState } from "react";
import type { OrderTrackingResult, ShipmentTracking, TrackingEvent } from "@/lib/tracking/lookup";

// --- Swedish presentation layer -------------------------------------------------------------
// Everything below maps 17TRACK's raw (English) carrier data onto Swedish labels for display
// only -- none of it changes what lookupOrderTracking/refreshTrackingCache fetch or store.

const STEP_LABELS = ["Skickad", "Under transport", "Ute för leverans", "Levererad"] as const;
type Stage = 0 | 1 | 2 | 3;

const STATUS_SV: Record<string, string> = {
  InfoReceived: "Information mottagen",
  PickedUp: "Hämtat av transportör",
  Departure: "Avgått från terminal",
  Arrival: "Ankommit till terminal",
  AvailableForPickup: "Klart för upphämtning",
  OutForDelivery: "Ute för leverans",
  Delivered: "Levererat",
  Exception: "Avvikelse upptäckt",
  Alert: "Avvikelse upptäckt",
  Undelivered: "Kunde inte levereras",
  Expired: "Spårningen har löpt ut",
  NotFound: "Väntar på spårningsdata",
  Returning: "På väg i retur",
  Returned: "Returnerad",
};

const EXCEPTION_STATUSES = new Set(["Exception", "Alert", "Undelivered", "Expired", "NotFound", "Returning", "Returned"]);

function swedishStatusLabel(rawStatus: string): string {
  if (STATUS_SV[rawStatus]) return STATUS_SV[rawStatus];
  // Per-event sub_status values carry a "<MajorStatus>_<Variant>" suffix in real 17TRACK data
  // (e.g. "Delivered_Other", confirmed against a real delivered shipment -- same pattern already
  // handled for "InTransit_*" below) -- match the family, not just the bare major status.
  if (rawStatus.startsWith("Delivered")) return STATUS_SV.Delivered;
  return "Under transport"; // covers every InTransit_* sub-status variant
}

function stageForStatus(rawStatus: string): Stage {
  if (rawStatus.startsWith("Delivered")) return 3;
  if (rawStatus === "OutForDelivery" || rawStatus === "AvailableForPickup") return 2;
  return 1; // InfoReceived / PickedUp / Departure / Arrival / InTransit_* / unknown exceptions
}

// Known, literal carrier strings observed in real 17TRACK responses, mapped by hand -- never a
// live machine translation. Anything not in this list falls back to the Swedish status label
// instead of showing raw, untranslated English to a customer.
const DESCRIPTION_SV: Record<string, string> = {
  "parcel information received": "Paketinformation mottagen",
  "shipment information received": "Paketinformation mottagen",
  "shipment picked up": "Paketet hämtat",
  "shipment arrived at facility and measured": "Ankom till terminal och mättes",
  "depart from facility to service provider": "Skickat vidare till transportör",
  "clearence processing completed - export": "Tullbehandling slutförd (export)",
  "clearance processing completed - export": "Tullbehandling slutförd (export)",
  "arrived at the origin international airport": "Ankom till internationell flygplats",
  "the country of origin commences customs declaration": "Tulldeklaration påbörjad",
  "shipment is in transit to next facility": "På väg till nästa terminal",
  "departed from sort facility": "Avgick från sorteringsterminal",
  "arrived at origin facility": "Ankom till terminal",
  "waiting for a flight": "Väntar på flygtransport",
  "hand over to airline": "Överlämnad till flygbolag",
};

function translateDescription(description: string | undefined, fallbackLabel: string): string {
  if (!description) return fallbackLabel;
  const key = description.trim().toLowerCase().replace(/\.+$/, "");
  if (DESCRIPTION_SV[key]) return DESCRIPTION_SV[key];
  // Already Swedish (e.g. a domestic last-mile carrier's own message) -- pass it through rather
  // than translating text that doesn't need it.
  if (/[åäö]/i.test(description)) return description;
  return fallbackLabel;
}

// Never show the parcel's country of origin to a customer -- strips China/CN in any of the forms
// 17TRACK sends them in, and drops the location entirely if nothing real is left after that.
function cleanLocation(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/mainland china/gi, "")
    .replace(/\bchina\b/gi, "")
    .replace(/,?\s*\bCN\b\.?/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function formatEventDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }),
  };
}

function shipmentPresentation(shipment: ShipmentTracking): { label: string; stage: Stage | null } {
  const latest = shipment.events[0];
  if (!latest) return { label: "Skickad", stage: 0 };
  const isException = EXCEPTION_STATUSES.has(latest.status);
  return { label: swedishStatusLabel(latest.status), stage: isException ? null : stageForStatus(latest.status) };
}

// --- Visual building blocks -------------------------------------------------------------------

function StageIcon({ stage }: { stage: Stage }) {
  const paths: Record<Stage, React.ReactNode> = {
    0: <path d="M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4m0-14v14m8-14v10l-8 4" />,
    1: <path d="M3 16V7a1 1 0 0 1 1-1h9v10M3 16h10m0 0h3.5a1 1 0 0 0 .9-.55L19 11h-5v-3M3 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0zm10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />,
    2: <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
    3: <path d="M5 12.5l4.5 4.5L19 7" />,
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[stage]}
    </svg>
  );
}

function ProgressBar({ stage }: { stage: Stage }) {
  return (
    <div>
      <div className="flex items-center">
        {STEP_LABELS.map((_, idx) => (
          <Fragment key={idx}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${idx <= stage ? "bg-fg" : "border border-line bg-bg"}`} aria-hidden />
            {idx < STEP_LABELS.length - 1 && <span className={`h-px flex-1 ${idx < stage ? "bg-fg" : "bg-line"}`} aria-hidden />}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-wide">
        {STEP_LABELS.map((label, idx) => (
          <span
            key={label}
            className={`${idx === 0 ? "text-left" : idx === STEP_LABELS.length - 1 ? "text-right" : "text-center"} ${idx <= stage ? "text-fg" : "text-muted"}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventTimeline({ events }: { events: TrackingEvent[] }) {
  return (
    <ol className="flex flex-col">
      {events.map((ev, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === events.length - 1;
        const label = swedishStatusLabel(ev.status);
        const text = translateDescription(ev.description, label);
        const location = cleanLocation(ev.location);
        const { date, time } = formatEventDate(ev.timestamp);
        return (
          <li key={idx} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && <span className="absolute left-[3px] top-3 bottom-0 w-px bg-line" aria-hidden />}
            <span
              className={`relative z-10 mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${isFirst ? "bg-fg" : "border border-line bg-bg"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className={`text-sm ${isFirst ? "font-medium text-fg" : "text-fg"}`}>{text}</p>
                <p className="whitespace-nowrap text-xs text-muted">
                  {date} · {time}
                </p>
              </div>
              {location && <p className="mt-0.5 text-xs text-muted">{location}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ShipmentCard({ shipment, index, total, orderNumber }: { shipment: ShipmentTracking; index: number; total: number; orderNumber: string }) {
  const { label, stage } = shipmentPresentation(shipment);

  return (
    <div className="border border-line p-6 sm:p-8">
      {total > 1 && (
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-muted">
          Paket {index + 1} av {total}
        </p>
      )}

      <div className="mb-8 flex items-start gap-4">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center border border-line text-fg">
          <StageIcon stage={stage ?? 1} />
        </span>
        <div>
          <p className="font-serif text-2xl leading-snug">{label}</p>
          {shipment.events.length === 0 && (
            <p className="mt-1 text-sm text-muted">
              {shipment.registered
                ? "Inga spårningshändelser ännu. Vi uppdaterar så snart transportören rapporterar status."
                : "Detaljerad spårning är inte tillgänglig ännu för detta paket. Kom tillbaka inom kort."}
            </p>
          )}
        </div>
      </div>

      {stage !== null && (
        <div className="mb-9">
          <ProgressBar stage={stage} />
        </div>
      )}

      <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted">Ordernummer</dt>
          <dd className="mt-1">{orderNumber}</dd>
        </div>
        {shipment.carrier && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Transportör</dt>
            <dd className="mt-1">{shipment.carrier}</dd>
          </div>
        )}
        {shipment.trackingNumber && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Spårningsnummer</dt>
            <dd className="mt-1 break-all">{shipment.trackingNumber}</dd>
          </div>
        )}
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted">Aktuell status</dt>
          <dd className="mt-1">{label}</dd>
        </div>
      </dl>

      {shipment.events.length > 0 && (
        <div className="border-t border-line pt-6">
          <h3 className="mb-5 text-xs font-semibold uppercase tracking-wide text-muted">Spårningshistorik</h3>
          <EventTimeline events={shipment.events} />
        </div>
      )}
    </div>
  );
}

function ShipmentResults({ result }: { result: OrderTrackingResult & { ok: true } }) {
  return (
    <div className="mt-12 border-t border-line pt-10">
      <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-muted">Order {result.orderNumber}</p>

      {result.notYetShipped && (
        <div className="border border-line p-6 text-sm leading-6 text-muted">
          Din beställning har inte skickats än. Så snart den skickas kan du följa leveransen här.
        </div>
      )}

      {!result.notYetShipped && (
        <div className="flex flex-col gap-6">
          {result.shipments.map((shipment, i) => (
            <ShipmentCard
              key={shipment.fulfillmentId}
              shipment={shipment}
              index={i}
              total={result.shipments.length}
              orderNumber={result.orderNumber}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Page component -----------------------------------------------------------------------

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
