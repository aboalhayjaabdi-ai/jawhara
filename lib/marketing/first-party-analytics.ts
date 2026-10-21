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
 * admin "Webbplatsstatistik" section has real visit/funnel/traffic-source data to show, with no
 * dependency on any third-party script or ad blocker. Gated behind the same cookie consent as the
 * Pixel/GA4 (never fires before accept). Uses sendBeacon when available so it survives the page
 * unloading right after (e.g. navigating to Shopify's hosted checkout), falling back to fetch
 * with keepalive otherwise. Best-effort: a dropped beacon only ever loses a visit-count data
 * point, never anything the store depends on functionally.
 */
export function logAnalyticsEvent(
  eventType: AnalyticsEventType,
  extra?: { productHandle?: string; productTitle?: string }
): void {
  if (typeof window === "undefined") return;
  if (getConsent() !== "accepted") return;

  const payload = {
    eventType,
    sessionId: getOrCreateSessionId(),
    visitorId: getOrCreateVisitorId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
    productHandle: extra?.productHandle ?? null,
    productTitle: extra?.productTitle ?? null,
  };

  const body = JSON.stringify(payload);
  const url = "/api/analytics/track";
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
  } catch {
    // Fall through to fetch below.
  }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {
    // Best-effort -- never surfaces to the visitor.
  });
}
