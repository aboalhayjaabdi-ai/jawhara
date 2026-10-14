"use client";

import { getConsent } from "./consent";

export type AnalyticsEventType = "page_view" | "view_content" | "add_to_cart" | "initiate_checkout";

const VISITOR_KEY = "jawhara_visitor_id";
const SESSION_KEY = "jawhara_session_id";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Long-lived (localStorage): identifies the same browser across visits -- "unique visitors".
function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = randomId();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

// Tab/window-scoped (sessionStorage): a fresh id per browsing session -- "visits" for the funnel.
function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/**
 * First-party analytics event log -- entirely separate from the Meta Pixel/GA4 calls in
 * events.ts (which send to Meta/Google), this persists into Jawhara's own Supabase tables so the
 * admin "Webbplatsstatistik" section has real visit/funnel data to show. Gated behind the same
 * cookie consent as Pixel/GA4 (lib/marketing/consent.ts) -- nothing is sent before "Acceptera".
 *
 * Fire-and-forget via sendBeacon (falling back to a keepalive fetch): never awaited, never blocks
 * rendering, and a failed send (offline, blocked storage, ad-blocker) just means one missing data
 * point, not an error surfaced to the visitor. The server (app/api/analytics/track) always
 * upserts the session row first and ignores a conflict, so sending `referrer`/`path` on every call
 * rather than only the "first" one is deliberately simple and race-free -- whichever call reaches
 * the server first wins the session's landing_path/traffic_source, every later one is a no-op.
 */
export function logAnalyticsEvent(eventType: AnalyticsEventType, extra?: { productHandle?: string; productTitle?: string }): void {
  if (typeof window === "undefined") return;
  if (getConsent() !== "accepted") return;

  const payload = {
    eventType,
    visitorId: getOrCreateVisitorId(),
    sessionId: getOrCreateSessionId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
    productHandle: extra?.productHandle ?? null,
    productTitle: extra?.productTitle ?? null,
  };

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.("/api/analytics/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/analytics/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
