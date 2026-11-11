// Browser-side Meta click id (fbc) / browser id (fbp) handling -- client-only module.
//
// Meta's pixel sets the _fbc cookie itself, but only on the page that still has ?fbclid= in its
// URL at the moment the pixel loads. On this site the pixel only loads after the cookie banner is
// accepted, and by then the visitor has often already navigated away from the landing URL
// (client-side routing drops the query string), so the ad click id was lost for most buyers.
// captureFbclidFromUrl() remembers it IN MEMORY ONLY on the landing page; it is written to storage
// only once marketing consent exists (persistPendingFbc), so nothing is stored without consent.
import { getConsent } from "./consent";
import { getVisitorId } from "./first-party-analytics";

const FBC_STORAGE_KEY = "jawhara_fbc";
// Meta treats an fbc older than its 90-day attribution horizon as useless.
const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

let pendingFbc: string | null = null;

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

/** Call once per real page load (before consent may exist). */
export function captureFbclidFromUrl(): void {
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return;
    // Meta's documented fbc format: fb.<subdomainIndex>.<creationTimeMs>.<fbclid>
    pendingFbc = `fb.1.${Date.now()}.${fbclid}`;
    if (getConsent() === "accepted") persistPendingFbc();
  } catch {
    // ignore
  }
}

/** Call when the visitor accepts the cookie banner. */
export function persistPendingFbc(): void {
  if (!pendingFbc) return;
  try {
    localStorage.setItem(FBC_STORAGE_KEY, pendingFbc);
  } catch {
    // Storage unavailable -- the in-memory value still works for this page session.
  }
}

function storedFbc(): string | null {
  try {
    const value = localStorage.getItem(FBC_STORAGE_KEY);
    if (!value) return null;
    const created = Number(value.split(".")[2]);
    if (!Number.isFinite(created) || Date.now() - created > FBC_MAX_AGE_MS) {
      localStorage.removeItem(FBC_STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export type ClientTracking = { consent: boolean; fbp: string | null; fbc: string | null; visitorId: string | null };

/** What the cart sync sends to the server (lib/marketing/cart-tracking-attributes.ts validates
 * it there). Empty unless marketing consent was given. */
export function getClientTracking(): ClientTracking {
  if (typeof window === "undefined" || getConsent() !== "accepted") return { consent: false, fbp: null, fbc: null, visitorId: null };
  return {
    consent: true,
    fbp: readCookie("_fbp"),
    // The most recent click wins: an fbclid from this page load beats an older stored one.
    fbc: pendingFbc ?? readCookie("_fbc") ?? storedFbc(),
    visitorId: getVisitorId(),
  };
}
