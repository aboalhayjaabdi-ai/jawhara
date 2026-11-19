import { supabaseService } from "@/lib/supabase/service-client";
import { getOrderItemImages } from "@/lib/order-images";
import { shopifyGraphQL } from "@/lib/shopify/client";
import { orderStores } from "@/lib/shopify/stores";
import { normalizeVariantTitle } from "@/lib/variant-title";
import { COLOR_GROUPS } from "@/lib/product-colors";
import { ErpError } from "./http";

if (typeof window !== "undefined") {
  throw new Error("lib/erp/orders.ts must never be imported into client code");
}

/** Products that are one colour of a model (e.g. "Lilly Väska" in black is its own product,
 * lilly-vaska-1): handle -> model and colour, from the site's own colour choices
 * (lib/product-colors.ts). Lets every order line name its colour in text, not only in the image. */
const COLOR_BY_HANDLE = new Map(COLOR_GROUPS.flatMap((g) => g.members.map((m) => [m.handle, { model: g.model, color: m.color }] as const)));

/** Paid (or partly refunded), not cancelled, test or hidden -- and something left to ship. */
const PAYABLE = ["PAID", "PARTIALLY_REFUNDED", "paid", "partially_refunded"];

const ORDER_SELECT =
  "id, shopify_id, order_number, phone, currency_code, financial_status, fulfillment_status, subtotal_price, total_shipping, total_discounts, total_price, note, cancelled_at, processed_at, created_at, shipping_address_id, hidden_at, is_test_order, " +
  "order_items(id, sku, title, quantity, fulfilled_quantity, refunded_quantity, unit_price, discounted_unit_price, image_url, variant_title_snapshot, variant_id, product_id, product_variants(title, weight, weight_unit), products(handle))";

export type ErpOrderStatus = "ready" | "partially_fulfilled" | "fulfilled" | "cancelled" | "unpaid" | "hidden";

function remaining(i: any): number {
  return Math.max(0, i.quantity - (i.fulfilled_quantity ?? 0) - (i.refunded_quantity ?? 0));
}

function orderStatus(o: any): ErpOrderStatus {
  if (o.cancelled_at) return "cancelled";
  if (o.hidden_at) return "hidden";
  if (!PAYABLE.includes(o.financial_status ?? "")) return "unpaid";
  const items = (o.order_items ?? []) as any[];
  const left = items.reduce((n, i) => n + remaining(i), 0);
  if (left === 0) return "fulfilled";
  return items.some((i) => (i.fulfilled_quantity ?? 0) > 0) ? "partially_fulfilled" : "ready";
}

/** Shipping method names (e.g. "PostNord Hemleverans") straight from Shopify, keyed by order id
 * tail -- not stored in Supabase. One query per store for the whole page; never throws. */
async function shippingMethods(shopifyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (shopifyIds.length === 0) return out;
  for (const store of orderStores()) {
    const missing = shopifyIds.filter((id) => !out.has(id));
    if (missing.length === 0) break;
    try {
      const data = await shopifyGraphQL<{ nodes: ({ id: string; shippingLine: { title: string } | null } | null)[] }>(
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id shippingLine { title } } } }`,
        { ids: missing.map((id) => `gid://shopify/Order/${id}`) },
        store
      );
      for (const n of data.nodes) if (n?.id && n.shippingLine?.title) out.set(n.id.split("/").pop()!, n.shippingLine.title);
    } catch (err) {
      console.error(`ERP: shipping methods from ${store} store failed:`, (err as Error).message);
    }
  }
  return out;
}

async function toErpOrders(rows: any[]): Promise<any[]> {
  if (rows.length === 0) return [];
  const addressIds = rows.map((o) => o.shipping_address_id).filter(Boolean);
  const [{ data: addresses }, { data: exports }, methods] = await Promise.all([
    addressIds.length
      ? supabaseService.from("addresses").select("id, first_name, last_name, company, address1, address2, city, province, zip, country, country_code, phone").in("id", addressIds)
      : Promise.resolve({ data: [] as any[] }),
    supabaseService.from("erp_order_exports").select("order_id, first_fetched_at, acknowledged_at, erp_reference").in("order_id", rows.map((o) => o.id)),
    shippingMethods(rows.map((o) => o.shopify_id).filter(Boolean)),
  ]);
  const addressById = new Map((addresses ?? []).map((a: any) => [a.id, a]));
  const exportByOrder = new Map((exports ?? []).map((e: any) => [e.order_id, e]));

  const allItems = rows.flatMap((o) => o.order_items ?? []);
  const fallbackImages = await getOrderItemImages(
    allItems.filter((i: any) => !i.image_url).map((i: any) => ({ id: i.id, variantId: i.variant_id, productId: i.product_id }))
  );

  return rows.map((o) => {
    const a = addressById.get(o.shipping_address_id);
    const exp = exportByOrder.get(o.id);
    return {
      orderId: o.id,
      orderNumber: o.order_number,
      status: orderStatus(o),
      createdAt: o.created_at,
      paidAt: o.processed_at,
      currency: o.currency_code,
      shippingMethod: (o.shopify_id && methods.get(o.shopify_id)) || null,
      totals: {
        subtotal: Number(o.subtotal_price ?? 0),
        shipping: Number(o.total_shipping ?? 0),
        discounts: Number(o.total_discounts ?? 0),
        total: Number(o.total_price ?? 0),
      },
      // Only what is needed to deliver the parcel: no email address, no customer history.
      recipient: {
        name: [a?.first_name, a?.last_name].filter(Boolean).join(" ") || null,
        company: a?.company || null,
        phone: a?.phone || o.phone || null,
      },
      shippingAddress: a
        ? { address1: a.address1, address2: a.address2 || null, city: a.city, province: a.province || null, zip: a.zip, country: a.country, countryCode: a.country_code }
        : null,
      customerNote: o.note || null,
      items: ((o.order_items ?? []) as any[])
        .filter((i) => remaining(i) > 0)
        .map((i) => ({
          lineId: i.id,
          sku: i.sku || null,
          title: i.title,
          variantTitle: normalizeVariantTitle(i.variant_title_snapshot ?? i.product_variants?.title ?? null),
          quantity: remaining(i),
          orderedQuantity: i.quantity,
          unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
          weight: i.product_variants?.weight != null ? Number(i.product_variants.weight) : null,
          weightUnit: i.product_variants?.weight_unit ?? null,
          // The exact purchased variant's image, frozen when the order came in; otherwise the
          // variant's (or product's) current first image.
          imageUrl: i.image_url ?? fallbackImages[i.id]?.imageUrl ?? null,
          productId: i.product_id,
          variantId: i.variant_id,
          productHandle: i.products?.handle ?? null,
          // Model and colour when the product is one colour of a model (bags, many jewellery
          // models); null otherwise -- then the colour/size is in variantTitle.
          model: COLOR_BY_HANDLE.get(i.products?.handle)?.model ?? null,
          color: COLOR_BY_HANDLE.get(i.products?.handle)?.color ?? null,
        })),
      erp: exp ? { firstFetchedAt: exp.first_fetched_at, acknowledgedAt: exp.acknowledged_at, erpReference: exp.erp_reference } : null,
    };
  });
}

/**
 * Orders ready to ship, oldest first. `exportState`: "new" (default; not yet acknowledged by the
 * ERP), "acknowledged", or "all". Paged by creation time (`since` = the previous page's
 * nextCursor). Every returned order is recorded as fetched.
 */
export async function listReadyOrders(params: { exportState: "new" | "acknowledged" | "all"; since: string | null; limit: number; includeTest: boolean }) {
  const { exportState, since, limit, includeTest } = params;
  const results: any[] = [];
  let cursor = since;
  // Pages through candidates until `limit` ready orders are found (fulfilled/acknowledged ones are
  // skipped in code), never more than a few hundred rows per call.
  for (let round = 0; round < 6 && results.length < limit; round++) {
    let q = supabaseService
      .from("orders")
      .select(ORDER_SELECT)
      .in("financial_status", PAYABLE)
      .is("cancelled_at", null)
      .is("hidden_at", null)
      // (NULL fulfillment_status = not shipped yet; a plain "not in" would drop those rows.)
      .or("fulfillment_status.is.null,fulfillment_status.not.in.(FULFILLED,FULFILLMENT_NOT_REQUIRED,RESTOCKED)")
      .order("created_at", { ascending: true })
      .limit(100);
    // Shopify orders only (the old Stripe-era site orders are never handed out); test orders only
    // when asked for (integration testing).
    q = includeTest ? q.or("source.eq.shopify,is_test_order.eq.true") : q.eq("source", "shopify").eq("is_test_order", false);
    // Optional go-live date: orders placed before it are left to be handled the way they are today.
    const from = process.env.ERP_ORDERS_FROM && !Number.isNaN(new Date(process.env.ERP_ORDERS_FROM).getTime()) ? new Date(process.env.ERP_ORDERS_FROM).toISOString() : null;
    if (from) q = q.gte("created_at", from);
    if (cursor) q = q.gt("created_at", cursor);
    const { data, error } = await q;
    if (error) throw new Error(`orders query failed: ${error.message}`);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].created_at;

    const ready = rows.filter((o) => ["ready", "partially_fulfilled"].includes(orderStatus(o)));
    const { data: exp } = ready.length
      ? await supabaseService.from("erp_order_exports").select("order_id, acknowledged_at").in("order_id", ready.map((o) => o.id))
      : { data: [] as any[] };
    const acked = new Set((exp ?? []).filter((e: any) => e.acknowledged_at).map((e: any) => e.order_id));
    for (const o of ready) {
      const isAcked = acked.has(o.id);
      if (exportState === "new" && isAcked) continue;
      if (exportState === "acknowledged" && !isAcked) continue;
      results.push(o);
      if (results.length >= limit) { cursor = o.created_at; break; }
    }
    if (rows.length < 100) { if (results.length < limit) cursor = null; break; }
  }

  const now = new Date().toISOString();
  if (results.length) {
    // first_fetched_at keeps its original value on conflict (only last_fetched_at is refreshed).
    const { data: existing } = await supabaseService.from("erp_order_exports").select("order_id").in("order_id", results.map((o) => o.id));
    const known = new Set((existing ?? []).map((e: any) => e.order_id));
    const fresh = results.filter((o) => !known.has(o.id)).map((o) => ({ order_id: o.id, first_fetched_at: now, last_fetched_at: now }));
    if (fresh.length) await supabaseService.from("erp_order_exports").insert(fresh);
    if (known.size) await supabaseService.from("erp_order_exports").update({ last_fetched_at: now }).in("order_id", [...known]);
  }
  return { orders: await toErpOrders(results), nextCursor: results.length >= limit ? cursor : null };
}

async function findOrder(orderNumber: string): Promise<any> {
  const { data, error } = await supabaseService.from("orders").select(ORDER_SELECT).eq("order_number", orderNumber).maybeSingle();
  if (error) throw new Error(`order query failed: ${error.message}`);
  if (!data) throw new ErpError(404, "order_not_found", `Order ${orderNumber} not found.`);
  return data;
}

/** One order in any state (the ERP can re-check it is still ready before shipping). */
export async function getErpOrder(orderNumber: string) {
  const [order] = await toErpOrders([await findOrder(orderNumber)]);
  return { order };
}

/** Marks an order as taken over by the ERP, so it no longer appears under exportState=new.
 * Idempotent: acknowledging again keeps the first time and updates the reference if given. */
export async function acknowledgeOrder(orderNumber: string, erpReference: string | null) {
  const order = await findOrder(orderNumber);
  const status = orderStatus(order);
  if (status === "cancelled" || status === "unpaid" || status === "hidden") {
    throw new ErpError(409, `order_${status}`, `Order ${orderNumber} is ${status} and must not be shipped.`);
  }
  const now = new Date().toISOString();
  const { data: existing } = await supabaseService.from("erp_order_exports").select("acknowledged_at, erp_reference").eq("order_id", order.id).maybeSingle();
  const row = {
    order_id: order.id,
    last_fetched_at: now,
    acknowledged_at: existing?.acknowledged_at ?? now,
    erp_reference: erpReference ?? existing?.erp_reference ?? null,
  };
  if (existing) await supabaseService.from("erp_order_exports").update(row).eq("order_id", order.id);
  else await supabaseService.from("erp_order_exports").insert({ ...row, first_fetched_at: now });
  return { orderNumber: order.order_number, status, acknowledgedAt: new Date(row.acknowledged_at).toISOString(), erpReference: row.erp_reference, alreadyAcknowledged: !!existing?.acknowledged_at };
}
