// Client-only: mirrors a browser pixel event to the server-side Conversions API route
// (app/api/meta/event) with the same event_id, plus the identifiers Meta uses for matching.
// Every function here is a no-op without cookie consent.
import { getConsent } from "./consent";
import { getClientTracking } from "./click-id";
import { getVisitorId } from "./first-party-analytics";

const EMAIL_HASH_KEY = "jawhara_em";

export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** sha256 hex of the visitor's email, if they gave it to us (newsletter) with consent. */
export function getHashedEmail(): string | null {
  if (typeof window === "undefined" || getConsent() !== "accepted") return null;
  try {
    const v = localStorage.getItem(EMAIL_HASH_KEY);
    return v && /^[a-f0-9]{64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Remembers a visitor-supplied email (hashed, never in plain text) for Meta matching on their
 * later events, and hands it to the already-loaded pixel right away. */
export async function rememberEmailForMatching(email: string): Promise<void> {
  if (typeof window === "undefined" || getConsent() !== "accepted") return;
  try {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(EMAIL_HASH_KEY, hex);
    const pixelId = (window as any).__jawharaMetaPixelId as string | undefined;
    if (pixelId) window.fbq?.("init", pixelId, pixelUserData());
  } catch {
    // ignore
  }
}

/** Advanced-matching data for fbq('init', id, data). The pixel hashes external_id itself; em is
 * already a sha256 hex, which the pixel recognises and passes through unchanged. */
export function pixelUserData(): Record<string, string> {
  const data: Record<string, string> = {};
  const vid = getVisitorId();
  if (vid) data.external_id = vid;
  const em = getHashedEmail();
  if (em) data.em = em;
  return data;
}

function readFbpCookie(): string | null {
  try {
    const m = document.cookie.split("; ").find((c) => c.startsWith("_fbp="));
    return m ? decodeURIComponent(m.slice(5)) : null;
  } catch {
    return null;
  }
}

function post(body: string): void {
  const url = "/api/meta/event";
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through
  }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

export function sendMetaServerEvent(eventName: string, eventId: string, customData: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || getConsent() !== "accepted") return;

  const send = () => {
    const tracking = getClientTracking();
    post(
      JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: window.location.href,
        custom_data: customData,
        fbp: tracking.fbp,
        fbc: tracking.fbc,
        external_id: getVisitorId(),
        em: getHashedEmail(),
      })
    );
  };

  // Right after consent the pixel script may not have set _fbp yet -- give it a moment so the
  // very first server event carries the same browser id as the browser event.
  if (readFbpCookie()) {
    send();
    return;
  }
  let waited = 0;
  const timer = setInterval(() => {
    waited += 250;
    if (readFbpCookie() || waited >= 2000) {
      clearInterval(timer);
      send();
    }
  }, 250);
}
