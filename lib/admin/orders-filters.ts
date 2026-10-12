import { supabaseService } from "@/lib/supabase/service-client";

export type OrdersListFilters = {
  q?: string;
  status?: string; // PAID | UNPAID | PARTIALLY_PAID | REFUNDED | PARTIALLY_REFUNDED | CANCELLED
  fulfillment?: string; // FULFILLED | PARTIALLY_FULFILLED | UNFULFILLED
  provider?: "shopify" | "stripe" | "manual";
  carrier?: string;
  customerId?: string;
  date?: string; // exact date, YYYY-MM-DD
  from?: string;
  to?: string;
  sort?: "created_at" | "total_price";
  dir?: "asc" | "desc";
  // "active" (default) excludes hidden orders -- the normal list/search/dashboard view.
  // "hidden" shows only hidden orders (the recovery/audit view). "all" shows everything.
  view?: "active" | "hidden" | "all";
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

/** Shared between the order list page and the export route, so filter logic lives in one place. */
export function parseOrdersListFilters(sp: SearchParams): OrdersListFilters {
  return {
    q: one(sp.q),
    status: one(sp.status),
    fulfillment: one(sp.fulfillment),
    provider: one(sp.provider) as OrdersListFilters["provider"],
    carrier: one(sp.carrier),
    customerId: one(sp.customerId),
    date: one(sp.date),
    from: one(sp.from),
    to: one(sp.to),
    sort: (one(sp.sort) as OrdersListFilters["sort"]) ?? "created_at",
    dir: (one(sp.dir) as OrdersListFilters["dir"]) ?? "desc",
    view: (one(sp.view) as OrdersListFilters["view"]) ?? "active",
  };
}

/** A fulfillment_status value considered "partially fulfilled" in the UI maps to either of two
 * real values seen in the data: our own action writes PARTIALLY_FULFILLED, Shopify-imported
 * orders carry IN_PROGRESS for the same real-world state. */
const PARTIALLY_FULFILLED_VALUES = ["PARTIALLY_FULFILLED", "IN_PROGRESS"];

/** Orders whose fulfillments include the given carrier -- resolved as a plain order-id allowlist
 * since PostgREST can't filter the parent by a child table's column in one query. Call this before
 * applyOrdersListFilters and pass the result as filters.carrier is NOT used directly by
 * applyOrdersListFilters; instead pass the resolved ids via the `ids` param below. */
export async function resolveCarrierOrderIds(carrier: string): Promise<string[]> {
  const { data } = await supabaseService.from("fulfillments").select("order_id").eq("tracking_company", carrier);
  return [...new Set((data ?? []).map((r) => r.order_id))];
}

/** Applies the filters to a Supabase query builder. Typed loosely (the PostgREST builder's generic
 * chaining type is unwieldy for a shared helper) -- this is an internal admin-only utility.
 * `carrierOrderIds` is the pre-resolved allowlist from resolveCarrierOrderIds, when filters.carrier
 * is set -- an empty array (no matches) still correctly yields zero rows via `.in("id", [])`. */
export function applyOrdersListFilters<
  T extends { or: Function; eq: Function; ilike: Function; gte: Function; lt: Function; lte: Function; is: Function; not: Function; in: Function; order: Function },
>(query: T, filters: OrdersListFilters, carrierOrderIds?: string[]): T {
  let q: any = query;

  if (filters.view === "hidden") q = q.not("hidden_at", "is", null);
  else if (filters.view !== "all") q = q.is("hidden_at", null);

  if (filters.q) q = q.or(`order_number.ilike.%${filters.q}%,email.ilike.%${filters.q}%`);
  if (filters.customerId) q = q.eq("customer_id", filters.customerId);

  if (filters.status === "CANCELLED") {
    q = q.not("cancelled_at", "is", null);
  } else if (filters.status === "UNPAID") {
    q = q.ilike("financial_status", "pending");
  } else if (filters.status) {
    q = q.ilike("financial_status", filters.status);
  }

  if (filters.fulfillment === "PARTIALLY_FULFILLED") {
    q = q.in("fulfillment_status", PARTIALLY_FULFILLED_VALUES);
  } else if (filters.fulfillment === "UNFULFILLED") {
    q = q.or("fulfillment_status.eq.UNFULFILLED,fulfillment_status.is.null");
  } else if (filters.fulfillment) {
    q = q.eq("fulfillment_status", filters.fulfillment);
  }

  if (filters.provider) q = q.eq("source", filters.provider);

  if (filters.carrier && carrierOrderIds) q = q.in("id", carrierOrderIds.length > 0 ? carrierOrderIds : ["00000000-0000-0000-0000-000000000000"]);

  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    q = q.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  } else {
    if (filters.from) q = q.gte("created_at", filters.from);
    if (filters.to) q = q.lte("created_at", filters.to);
  }

  q = q.order(filters.sort ?? "created_at", { ascending: filters.dir === "asc" });
  return q;
}

/** The order immediately before/after a given order within the same filtered + sorted list the
 * order list page itself shows -- powers the order detail page's up/down prev/next navigation.
 * Fetches just the filtered id list (orders volume here is a few hundred rows, trivial to hold in
 * memory) rather than a keyset-pagination query, so it reuses applyOrdersListFilters verbatim
 * instead of re-deriving its WHERE/ORDER BY logic. */
export async function getAdjacentOrderIds(
  orderId: string,
  filters: OrdersListFilters,
  carrierOrderIds?: string[]
): Promise<{ prevId: string | null; nextId: string | null }> {
  let query: any = supabaseService.from("orders").select("id");
  query = applyOrdersListFilters(query, filters, carrierOrderIds);
  const { data } = await query;
  const ids: string[] = (data ?? []).map((r: any) => r.id);
  const idx = ids.indexOf(orderId);
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: idx > 0 ? ids[idx - 1] : null,
    nextId: idx < ids.length - 1 ? ids[idx + 1] : null,
  };
}
