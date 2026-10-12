// Plain localStorage helper -- no "window" guard needed (client-only module), every accessor
// wrapped since localStorage can throw in a private window/blocked storage, matching this
// project's own browser-storage convention elsewhere (e.g. lib/recently-viewed.ts).
const KEY = "jawhara_cookie_consent";

export type ConsentState = "accepted" | "rejected" | null;

export function getConsent(): ConsentState {
  try {
    const value = localStorage.getItem(KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(value: "accepted" | "rejected"): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage unavailable -- the banner will simply reappear next visit, same as a fresh visitor.
  }
}
