import { supabaseService } from "@/lib/supabase/service-client";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";
import { shopifyGraphQL, storeForNode } from "@/lib/shopify/client";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";
import { sendShippingEmailForFulfillment } from "@/lib/email/fulfillment-shipping-email";
import { ErpError } from "./http";

if (typeof window !== "undefined") {
  throw new Error("lib/erp/shipments.ts must never be imported into client code");
}

const PAYABLE = ["PAID", "PARTIALLY_REFUNDED", "paid", "partially_refunded"];

function normalizeTracking(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/[\s-]+/g, "").toUpperCase() : "";
  if (!/^[A-Z0-9]{6,40}$/.test(s)) throw new ErpError(422, "invalid_tracking_number", "trackingNumber must be 6-40 letters/digits.");
  return s;
}

function optionalString(v: unknown, field: string, max = 200): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.length > max) throw new ErpError(422, "invalid_field", `${field} must be a string (max ${max} characters).`);
  return v.trim();
}

function shipmentView(f: any, orderNumber: string) {
  return {
    shipmentId: f.id,
    orderNumber,
    trackingNumber: f.tracking_number,
    carrier: f.tracking_company,
    trackingUrl: f.tracking_url,
    shippedAt: f.shipped_at ?? f.created_at,
    deliveredAt: f.delivered_at ?? null,
    shopifySynced: !!f.shopify_fulfillment_id || !!f.shopify_id,
  };
}

/**
 * Registers a shipment the forwarder has sent: exactly what "Lägg till leverans" in Jawhara admin
 * does (lib/../orders/[id]/actions/fulfillment.ts), with the same building blocks -- the real
 * Shopify fulfillment first (customer not notified by Shopify), then the Supabase rows, 17TRACK
 * registration and Jawhara's own shipping email (which also starts the reminder/review emails).
 *
 * Never registers twice: the same tracking number on the same order returns the existing shipment
 * (200 already_registered), and nothing beyond what is still unshipped can be fulfilled. Test
 * orders (is_test_order) skip Shopify, 17TRACK and the email. `dryRun` validates and returns the
 * plan without writing anything.
 */
export async function createShipment(body: any) {
  const orderNumberRaw = typeof body?.orderNumber === "string" ? body.orderNumber.trim().toUpperCase() : "";
  if (!orderNumberRaw) throw new ErpError(422, "missing_order_number", "orderNumber is required.");
  const orderNumber = orderNumberRaw.startsWith("#") ? orderNumberRaw : `#${orderNumberRaw}`;
  const trackingNumber = normalizeTracking(body?.trackingNumber);
  const trackingUrl = optionalString(body?.trackingUrl, "trackingUrl", 500);
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) throw new ErpError(422, "invalid_tracking_url", "trackingUrl must start with https://");
  const carrier = optionalString(body?.carrier, "carrier", 80) ?? detectCarrierFromTrackingNumber(trackingNumber);
  const dryRun = body?.dryRun === true;

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, shopify_id, financial_status, cancelled_at, hidden_at, is_test_order")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) throw new ErpError(404, "order_not_found", `Order ${orderNumber} not found.`);
  if (order.cancelled_at) throw new ErpError(409, "order_cancelled", `Order ${orderNumber} is cancelled -- do not ship it.`);
  if (order.hidden_at) throw new ErpError(409, "order_hidden", `Order ${orderNumber} is hidden in admin -- do not ship it.`);
  if (!PAYABLE.includes(order.financial_status ?? "")) throw new ErpError(409, "order_unpaid", `Order ${orderNumber} is not paid.`);

  // Duplicate guard: this tracking number is already registered on this order.
  const { data: existing } = await supabaseService
    .from("fulfillments")
    .select("id, tracking_number, tracking_company, tracking_url, shipped_at, created_at, delivered_at, shopify_id, shopify_fulfillment_id, status")
    .eq("order_id", order.id)
    .ilike("tracking_number", trackingNumber)
    .neq("status", "CANCELLED")
    .limit(1)
    .maybeSingle();
  if (existing) return { status: 200, body: { result: "already_registered", shipment: shipmentView(existing, order.order_number) } };

  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, sku, title, shopify_id, quantity, fulfilled_quantity, refunded_quantity")
    .eq("order_id", order.id);
  const left = (i: any) => Math.max(0, i.quantity - (i.fulfilled_quantity ?? 0) - (i.refunded_quantity ?? 0));

  // Which lines: all that are still unshipped, or the ones given (by lineId, or by SKU).
  let lines: { item: any; quantity: number }[];
  if (Array.isArray(body?.items) && body.items.length > 0) {
    const taken = new Map<string, number>();
    lines = body.items.map((req: any, idx: number) => {
      const qty = Number(req?.quantity);
      if (!Number.isInteger(qty) || qty <= 0) throw new ErpError(422, "invalid_quantity", `items[${idx}].quantity must be a positive integer.`);
      const candidates = (items ?? []).filter((i: any) =>
        req?.lineId ? i.id === req.lineId : req?.sku ? (i.sku ?? "").toUpperCase() === String(req.sku).toUpperCase() : false
      );
      if (candidates.length === 0) throw new ErpError(422, "unknown_item", `items[${idx}] matches no line on order ${orderNumber}.`);
      const item = candidates.find((i: any) => left(i) - (taken.get(i.id) ?? 0) >= qty);
      if (!item) throw new ErpError(409, "quantity_exceeds_remaining", `items[${idx}]: only ${candidates.reduce((n: number, i: any) => n + left(i) - (taken.get(i.id) ?? 0), 0)} left to ship.`);
      taken.set(item.id, (taken.get(item.id) ?? 0) + qty);
      return { item, quantity: qty };
    });
  } else {
    lines = (items ?? []).filter((i: any) => left(i) > 0).map((i: any) => ({ item: i, quantity: left(i) }));
  }
  if (lines.length === 0) throw new ErpError(409, "nothing_to_fulfill", `Order ${orderNumber} has nothing left to ship.`);

  const plan = {
    orderNumber: order.order_number,
    trackingNumber,
    carrier,
    trackingUrl,
    items: lines.map((l) => ({ lineId: l.item.id, sku: l.item.sku, title: l.item.title, quantity: l.quantity })),
    testOrder: order.is_test_order,
  };
  if (dryRun) return { status: 200, body: { result: "dry_run", plan } };

  // 1) Shopify first (as admin does): if Shopify refuses, nothing is written and no email goes out.
  let shopifyFulfillmentId: string | null = null;
  if (order.shopify_id && !order.is_test_order) {
    const missing = lines.find((l) => !l.item.shopify_id);
    if (missing) throw new ErpError(409, "line_not_in_shopify", `${missing.item.title}: line has no Shopify link.`);
    const res = await createShopifyFulfillment({
      shopifyOrderId: order.shopify_id,
      lineItems: lines.map((l) => ({ shopifyLineItemId: l.item.shopify_id, quantity: l.quantity })),
      trackingNumber,
      trackingCompany: carrier,
      trackingUrl,
    });
    if (!res.ok) {
      const nothingLeft = /inga artiklar kvar/i.test(res.error);
      throw new ErpError(nothingLeft ? 409 : 502, nothingLeft ? "nothing_to_fulfill" : "shopify_rejected", `Shopify: ${res.error}`);
    }
    shopifyFulfillmentId = res.shopifyFulfillmentId;
  }

  // 2) Supabase, same rows as admin's createFulfillment.
  const { data: fulfillment, error } = await supabaseService
    .from("fulfillments")
    .insert({
      order_id: order.id,
      status: "SUCCESS",
      tracking_number: trackingNumber,
      tracking_company: carrier,
      tracking_url: trackingUrl,
      shipped_at: new Date().toISOString(),
      created_by: null,
      shopify_id: shopifyFulfillmentId ? shopifyFulfillmentId.split("/").pop() : null,
      shopify_fulfillment_id: shopifyFulfillmentId,
    })
    .select("id, tracking_number, tracking_company, tracking_url, shipped_at, created_at, delivered_at, shopify_id, shopify_fulfillment_id")
    .single();
  if (error || !fulfillment) throw new Error(`fulfillment insert failed: ${error?.message}`);

  await supabaseService.from("fulfillment_items").insert(lines.map((l) => ({ fulfillment_id: fulfillment.id, order_item_id: l.item.id, quantity: l.quantity })));
  for (const l of lines) {
    await supabaseService.from("order_items").update({ fulfilled_quantity: (l.item.fulfilled_quantity ?? 0) + l.quantity }).eq("id", l.item.id);
  }
  const { data: refreshed } = await supabaseService.from("order_items").select("quantity, fulfilled_quantity").eq("order_id", order.id);
  const all = (refreshed ?? []).every((i: any) => i.fulfilled_quantity >= i.quantity);
  const any = (refreshed ?? []).some((i: any) => i.fulfilled_quantity > 0);
  await supabaseService.from("orders").update({ fulfillment_status: all ? "FULFILLED" : any ? "PARTIALLY_FULFILLED" : "UNFULFILLED" }).eq("id", order.id);

  // 3) Tracking registration + Jawhara's shipping email -- never for test orders.
  let customerNotified = false;
  if (!order.is_test_order) {
    await registerFulfillmentsForTracking([{ id: fulfillment.id, trackingNumber, trackingCompany: carrier }]);
    customerNotified = await sendShippingEmailForFulfillment(fulfillment.id);
  }

  // The ERP has clearly taken this order over.
  const now = new Date().toISOString();
  const { data: exp } = await supabaseService.from("erp_order_exports").select("acknowledged_at").eq("order_id", order.id).maybeSingle();
  if (!exp) await supabaseService.from("erp_order_exports").insert({ order_id: order.id, first_fetched_at: now, last_fetched_at: now, acknowledged_at: now });
  else if (!exp.acknowledged_at) await supabaseService.from("erp_order_exports").update({ acknowledged_at: now }).eq("order_id", order.id);

  await supabaseService.from("audit_log").insert({
    actor_id: null,
    action: "erp.create_fulfillment",
    entity_type: "order",
    entity_id: order.id,
    detail: { fulfillmentId: fulfillment.id, shopifyFulfillmentId, trackingNumber, carrier, items: plan.items, customerNotified, testOrder: order.is_test_order },
  });

  return { status: 201, body: { result: "created", shipment: { ...shipmentView(fulfillment, order.order_number), items: plan.items, customerNotified } } };
}

const STATUS_TO_SHOPIFY: Record<string, string> = {
  in_transit: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY",
  ready_for_pickup: "READY_FOR_PICKUP",
  delivered: "DELIVERED",
  attempted_delivery: "ATTEMPTED_DELIVERY",
  exception: "FAILURE",
};

/**
 * A delivery status from the forwarder for an already registered shipment. "delivered" sets the
 * shipment's delivered time in Supabase (which also stops the "on its way" reminder). Each status
 * is also added to the Shopify fulfillment as a tracking event, once per shipment and status. The
 * same status twice is a no-op (200 unchanged).
 */
export async function updateShipmentStatus(trackingNumberRaw: string, body: any) {
  const trackingNumber = normalizeTracking(decodeURIComponent(trackingNumberRaw));
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!STATUS_TO_SHOPIFY[status]) throw new ErpError(422, "invalid_status", `status must be one of: ${Object.keys(STATUS_TO_SHOPIFY).join(", ")}.`);
  const occurredAt = body?.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new ErpError(422, "invalid_occurred_at", "occurredAt must be an ISO 8601 date-time.");
  const message = optionalString(body?.message, "message", 300);
  const dryRun = body?.dryRun === true;

  const { data: rows } = await supabaseService
    .from("fulfillments")
    .select("id, order_id, tracking_number, tracking_company, tracking_url, shipped_at, created_at, delivered_at, shopify_id, shopify_fulfillment_id, orders!inner(order_number, is_test_order)")
    .ilike("tracking_number", trackingNumber)
    .neq("status", "CANCELLED");
  if (!rows || rows.length === 0) throw new ErpError(404, "shipment_not_found", `No registered shipment with tracking number ${trackingNumber}.`);

  const results = [];
  for (const f of rows as any[]) {
    const { data: done } = await supabaseService
      .from("audit_log")
      .select("id")
      .eq("action", "erp.shipment_status")
      .eq("entity_type", "fulfillment")
      .eq("entity_id", f.id)
      .contains("detail", { status })
      .limit(1);
    if (done && done.length) {
      results.push({ ...shipmentView(f, f.orders.order_number), status, result: "unchanged" });
      continue;
    }
    if (dryRun) {
      results.push({ ...shipmentView(f, f.orders.order_number), status, result: "dry_run" });
      continue;
    }
    if (status === "delivered" && !f.delivered_at) {
      await supabaseService.from("fulfillments").update({ delivered_at: occurredAt.toISOString() }).eq("id", f.id);
      f.delivered_at = occurredAt.toISOString();
    }
    let shopify: { updated: boolean; error?: string } = { updated: false };
    const gid = f.shopify_fulfillment_id ?? (f.shopify_id ? `gid://shopify/Fulfillment/${f.shopify_id}` : null);
    if (gid && !f.orders.is_test_order) {
      try {
        const store = await storeForNode(gid);
        if (!store) throw new Error("fulfillment not found in any Shopify store");
        const r = await shopifyGraphQL<{ fulfillmentEventCreate: { userErrors: { message: string }[] } }>(
          `mutation($e: FulfillmentEventInput!) { fulfillmentEventCreate(fulfillmentEvent: $e) { fulfillmentEvent { id } userErrors { field message } } }`,
          { e: { fulfillmentId: gid, status: STATUS_TO_SHOPIFY[status], happenedAt: occurredAt.toISOString(), ...(message ? { message } : {}) } },
          store
        );
        const errs = r.fulfillmentEventCreate.userErrors;
        shopify = errs.length ? { updated: false, error: errs.map((e) => e.message).join("; ") } : { updated: true };
      } catch (err) {
        shopify = { updated: false, error: (err as Error).message.slice(0, 300) };
      }
    }
    // Recorded (and so never repeated) only once Shopify took it -- a Shopify error leaves it
    // unrecorded, so the ERP retrying the same call tries Shopify again.
    if (!shopify.error) {
      await supabaseService.from("audit_log").insert({
        actor_id: null,
        action: "erp.shipment_status",
        entity_type: "fulfillment",
        entity_id: f.id,
        detail: { status, occurredAt: occurredAt.toISOString(), message, trackingNumber, shopify },
      });
    }
    results.push({ ...shipmentView(f, f.orders.order_number), status, result: shopify.error ? "saved_shopify_failed" : "updated", shopify });
  }
  return { status: 200, body: { shipments: results } };
}
