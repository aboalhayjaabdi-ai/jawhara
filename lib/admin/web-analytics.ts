import { createAuthServerClient } from "@/lib/supabase/server-auth";

const STOCKHOLM_TZ = "Europe/Stockholm";

export type WebAnalyticsRange = "today" | "yesterday" | "7d" | "30d" | "custom";

export type WebAnalyticsMetrics = {
  range: { from: string; to: string };
  visits: number;
  uniqueVisitors: number;
  productViews: number;
  topProducts: { productHandle: string; productTitle: string | null; views: number }[];
  addToCartSessions: number;
  checkoutSessions: number;
  purchases: number;
  abandonedCheckouts: number;
  conversionRate: number; // purchases / visits, 0-100
  trafficSources: { source: "instagram" | "facebook" | "google" | "direct" | "other"; sessions: number }[];
  dailyVisits: { date: string; visits: number }[];
  funnel: { visits: number; productViews: number; addToCart: number; checkout: number; purchases: number };
};

function stockholmTodayDateString(): string {
  // sv-SE formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("sv-SE", { timeZone: STOCKHOLM_TZ });
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // UTC noon sidesteps any DST-related rollover when just adding whole calendar days to a plain date.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a WebAnalyticsRange into [fromDate, toDate] Stockholm-local calendar dates (inclusive
 * both ends) -- deliberately plain dates, not UTC Date/timestamp boundaries like
 * lib/admin/analytics.ts's resolveRange(): the real Stockholm-day math (including DST) happens in
 * Postgres itself via `at time zone` in the analytics_* RPC functions (supabase/migrations/
 * 0047_web_analytics.sql), which has a correct, authoritative timezone database -- hand-rolling
 * that in JS would be redundant and more error-prone.
 */
export function resolveWebAnalyticsRange(range: WebAnalyticsRange, from?: string, to?: string): { fromDate: string; toDate: string } {
  const today = stockholmTodayDateString();
  switch (range) {
    case "today":
      return { fromDate: today, toDate: today };
    case "yesterday": {
      const y = addDaysToDateString(today, -1);
      return { fromDate: y, toDate: y };
    }
    case "7d":
      return { fromDate: addDaysToDateString(today, -6), toDate: today };
    case "30d":
      return { fromDate: addDaysToDateString(today, -29), toDate: today };
    case "custom": {
      const fromDate = from && DATE_RE.test(from) ? from : addDaysToDateString(today, -29);
      const toDate = to && DATE_RE.test(to) ? to : today;
      return fromDate <= toDate ? { fromDate, toDate } : { fromDate: toDate, toDate: fromDate };
    }
  }
}

/**
 * Real-data-only website analytics: visits/funnel/traffic-source come from the first-party
 * analytics_sessions/analytics_events tables (populated by app/api/analytics/track, gated behind
 * cookie consent). Purchases deliberately come straight from `orders` rather than a client-fired
 * "purchase" event, for two reasons: (1) it can never under/over-count from a dropped beacon or a
 * double-fire, and (2) it's restricted to orders a website visit could actually have produced --
 * `source in ('stripe', 'shopify')`, excluding only 'manual' (admin-entered) orders. Both real
 * sources count today: checkout fully migrated from this app's own Stripe flow to Shopify's
 * hosted checkout (see app/(storefront)/kassa/page.tsx's redirect and the "Add Phase 3: redirect
 * checkout to Shopify's hosted checkout page" commit) -- a version of this query that only
 * counted 'stripe' would show zero purchases forever post-migration, even with real sales still
 * happening every day.
 */
export async function getWebAnalyticsMetrics(range: WebAnalyticsRange, from?: string, to?: string): Promise<WebAnalyticsMetrics> {
  const supabase = await createAuthServerClient();
  const { fromDate, toDate } = resolveWebAnalyticsRange(range, from, to);

  const [summaryRes, topProductsRes, trafficRes, dailyRes, ordersRes] = await Promise.all([
    supabase.rpc("analytics_summary", { p_from: fromDate, p_to: toDate }).single(),
    supabase.rpc("analytics_top_products", { p_from: fromDate, p_to: toDate, p_limit: 5 }),
    supabase.rpc("analytics_traffic_sources", { p_from: fromDate, p_to: toDate }),
    supabase.rpc("analytics_daily_visits", { p_from: fromDate, p_to: toDate }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("source", ["stripe", "shopify"])
      .eq("financial_status", "paid")
      .is("hidden_at", null)
      .gte("created_at", `${fromDate}T00:00:00Z`)
      .lt("created_at", `${addDaysToDateString(toDate, 1)}T00:00:00Z`),
  ]);

  const summary = (summaryRes.data ?? {
    sessions: 0,
    unique_visitors: 0,
    page_views: 0,
    product_views: 0,
    product_view_sessions: 0,
    add_to_cart_sessions: 0,
    checkout_sessions: 0,
  }) as {
    sessions: number;
    unique_visitors: number;
    page_views: number;
    product_views: number;
    product_view_sessions: number;
    add_to_cart_sessions: number;
    checkout_sessions: number;
  };

  const purchases = ordersRes.count ?? 0;
  const visits = summary.sessions;
  const conversionRate = visits > 0 ? (purchases / visits) * 100 : 0;
  // Sessions that reached checkout but have no corresponding completed order -- an approximation
  // (no session-to-order link exists), floored at 0 since purchases can exceed tracked checkout
  // sessions (e.g. a visit that started before cookie consent was accepted, or an admin-created
  // manual order, neither of which analytics tracking ever saw).
  const abandonedCheckouts = Math.max(0, summary.checkout_sessions - purchases);

  const topProducts = ((topProductsRes.data ?? []) as any[]).map((r) => ({
    productHandle: r.product_handle as string,
    productTitle: (r.product_title as string | null) ?? null,
    views: Number(r.views),
  }));

  const trafficSources = ((trafficRes.data ?? []) as any[]).map((r) => ({
    source: r.traffic_source as WebAnalyticsMetrics["trafficSources"][number]["source"],
    sessions: Number(r.sessions),
  }));

  const dailyVisits = ((dailyRes.data ?? []) as any[]).map((r) => ({ date: r.day as string, visits: Number(r.sessions) }));

  return {
    range: { from: fromDate, to: toDate },
    visits,
    uniqueVisitors: summary.unique_visitors,
    productViews: summary.product_views,
    topProducts,
    addToCartSessions: summary.add_to_cart_sessions,
    checkoutSessions: summary.checkout_sessions,
    purchases,
    abandonedCheckouts,
    conversionRate,
    trafficSources,
    dailyVisits,
    funnel: {
      visits,
      productViews: summary.product_view_sessions,
      addToCart: summary.add_to_cart_sessions,
      checkout: summary.checkout_sessions,
      purchases,
    },
  };
}
