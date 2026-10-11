import { createAuthServerClient } from "@/lib/supabase/server-auth";

export type DashboardRange = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export type DashboardMetrics = {
  range: { start: string; end: string };
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shipping: number;
  tax: number;
  totalSales: number;
  ordersCount: number;
  aov: number;
  productsSold: number;
  returningCustomers: number;
  newCustomers: number;
  previous: {
    totalSales: number;
    ordersCount: number;
  };
  trend: { date: string; total: number }[];
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Resolves a DashboardRange (+ optional custom from/to) into [start, end) UTC-day boundaries. */
export function resolveRange(range: DashboardRange, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86400_000);

  switch (range) {
    case "today":
      return { start: todayStart, end: tomorrowStart };
    case "yesterday": {
      const start = new Date(todayStart.getTime() - 86400_000);
      return { start, end: todayStart };
    }
    case "7d":
      return { start: new Date(todayStart.getTime() - 7 * 86400_000), end: tomorrowStart };
    case "30d":
      return { start: new Date(todayStart.getTime() - 30 * 86400_000), end: tomorrowStart };
    case "month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { start, end: tomorrowStart };
    }
    case "custom": {
      const start = from ? startOfUtcDay(new Date(from)) : new Date(todayStart.getTime() - 30 * 86400_000);
      const end = to ? new Date(startOfUtcDay(new Date(to)).getTime() + 86400_000) : tomorrowStart;
      return { start, end };
    }
  }
}

/**
 * Real-data-only dashboard metrics, following Shopify's own documented formula:
 * Net sales = Gross sales − Discounts − Returns; Total sales = Net sales + Shipping + Taxes.
 * Cancelled orders are excluded throughout. Returns are attributed to the refund's own
 * created_at (a reasonable simplification, not the order's date) -- flagged here, not hidden.
 * Sessions/conversion rate are deliberately absent: no tracking exists yet to compute them from.
 */
export async function getDashboardMetrics(range: DashboardRange, from?: string, to?: string): Promise<DashboardMetrics> {
  const supabase = await createAuthServerClient();
  const { start, end } = resolveRange(range, from, to);
  const periodMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodMs);
  const prevEnd = start;

  const [{ data: orders }, { data: prevOrders }, { data: priorCustomers }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, customer_id, total_price, total_discounts, total_shipping, total_tax, created_at, cancelled_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString()),
    supabase
      .from("orders")
      .select("total_price, cancelled_at")
      .gte("created_at", prevStart.toISOString())
      .lt("created_at", prevEnd.toISOString()),
    supabase.from("orders").select("customer_id").lt("created_at", start.toISOString()).not("customer_id", "is", null),
  ]);

  const activeOrders = (orders ?? []).filter((o) => !o.cancelled_at);
  const orderIds = activeOrders.map((o) => o.id);

  const [{ data: items }, { data: refunds }] = await Promise.all([
    orderIds.length
      ? supabase.from("order_items").select("order_id, quantity, unit_price, discounted_unit_price").in("order_id", orderIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("refunds").select("amount, created_at").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
  ]);

  const grossSales = (items ?? []).reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const discounts = activeOrders.reduce((sum, o) => sum + (o.total_discounts ?? 0), 0);
  const returns = (refunds ?? []).reduce((sum, r) => sum + r.amount, 0);
  const netSales = grossSales - discounts - returns;
  const shipping = activeOrders.reduce((sum, o) => sum + (o.total_shipping ?? 0), 0);
  const tax = activeOrders.reduce((sum, o) => sum + (o.total_tax ?? 0), 0);
  const totalSales = netSales + shipping + tax;
  const ordersCount = activeOrders.length;
  const aov = ordersCount > 0 ? totalSales / ordersCount : 0;
  const productsSold = (items ?? []).reduce((sum, i) => sum + i.quantity, 0);

  const priorCustomerIds = new Set((priorCustomers ?? []).map((c) => c.customer_id));
  const periodCustomerIds = new Set(activeOrders.map((o) => o.customer_id).filter(Boolean));
  let returningCustomers = 0;
  let newCustomers = 0;
  for (const id of periodCustomerIds) {
    if (priorCustomerIds.has(id)) returningCustomers++;
    else newCustomers++;
  }

  const prevActiveOrders = (prevOrders ?? []).filter((o) => !o.cancelled_at);
  const prevTotalSales = prevActiveOrders.reduce((sum, o) => sum + (o.total_price ?? 0), 0);

  // Daily buckets (weekly if the range spans more than ~45 days, so the chart stays readable).
  const spanDays = periodMs / 86400_000;
  const bucketDays = spanDays > 45 ? 7 : 1;
  const buckets = new Map<string, number>();
  for (const o of activeOrders) {
    const d = new Date(o.created_at);
    const bucketStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (bucketDays === 7) {
      const dayOfWeek = bucketStart.getUTCDay();
      bucketStart.setUTCDate(bucketStart.getUTCDate() - dayOfWeek);
    }
    const key = bucketStart.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + (o.total_price ?? 0));
  }
  const trend = Array.from(buckets.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    grossSales,
    discounts,
    returns,
    netSales,
    shipping,
    tax,
    totalSales,
    ordersCount,
    aov,
    productsSold,
    returningCustomers,
    newCustomers,
    previous: { totalSales: prevTotalSales, ordersCount: prevActiveOrders.length },
    trend,
  };
}

export type DashboardTasks = {
  unfulfilledCount: number;
  lowStock: { variantId: string; productHandle: string; title: string; option: string | null; quantity: number }[];
  lowStockCount: number;
};

/**
 * Real, computable "things to do today" -- deliberately excludes refund requests, pending
 * reviews, and store notifications, since none of those have a real pending/queued concept in
 * the schema today (refunds only records completed refunds; reviews has no moderation column).
 */
export async function getDashboardTasks(): Promise<DashboardTasks> {
  const supabase = await createAuthServerClient();
  const LOW_STOCK_THRESHOLD = 5;

  const [{ count: unfulfilledCount }, { data: lowStockRows, count: lowStockCount }] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .is("cancelled_at", null)
      .or("fulfillment_status.is.null,fulfillment_status.eq.unfulfilled,fulfillment_status.eq.partial"),
    supabase
      .from("product_variants")
      .select("id, title, option1, option2, option3, inventory_quantity, products!inner(handle, title, status)", { count: "exact" })
      .eq("inventory_tracked", true)
      .eq("products.status", "active")
      .lte("inventory_quantity", LOW_STOCK_THRESHOLD)
      .order("inventory_quantity", { ascending: true })
      .limit(6),
  ]);

  const lowStock = ((lowStockRows ?? []) as any[]).map((v) => ({
    variantId: v.id,
    productHandle: v.products.handle,
    title: v.products.title,
    option: [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || null,
    quantity: v.inventory_quantity,
  }));

  return { unfulfilledCount: unfulfilledCount ?? 0, lowStock, lowStockCount: lowStockCount ?? 0 };
}
