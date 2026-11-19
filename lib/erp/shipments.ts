import { supabaseService } from "@/lib/supabase/service-client";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";
import { shopifyGraphQL, storeForNode } from "@/lib/shopify/client";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";
import { beginShipment, completeShipment, findOpenIntent, markShopifyFailed, ShipmentInProgressError } from "@/lib/fulfillment/shipment-intents";
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
 *
 * Never lost half-way: the shipment is recorded (lib/fulfillment/shipment-intents.ts) before
 * Shopify is called. If Shopify accepted it but a later step failed, the answer is 202 accepted and
 * the rest is finished automatically (a retry of this call finishes it at once).
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

  // An earlier call for this tracking number that did not finish (e.g. Shopify accepted it but a
  // later step failed): finish that one -- never a second shipment.
  const open = await findOpenIntent(order.id, trackingNumber);
  if (open) {
    const { data: openItems } = await supabaseService.from("order_items").select("id, sku, title").eq("order_id", order.id);
    const byId = new Map((openItems ?? []).map((i: any) => [i.id, i]));
    const plan = {
      orderNumber: order.order_number,
      trackingNumber,
      carrier: open.tracking_company,
      trackingUrl: open.tracking_url,
      items: open.items.map((l) => ({ lineId: l.orderItemId, sku: byId.get(l.orderItemId)?.sku ?? null, title: byId.get(l.orderItemId)?.title ?? null, quantity: l.quantity })),
      testOrder: order.is_test_order,
    };
    if (dryRun) return { status: 200, body: { result: "dry_run", plan, note: "This shipment is already being registered; sending it again finishes it." } };
    return finishShipment(order, open.id, plan, open.shopify_fulfillment_id, carrierOf(open));
  }

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

  // 0) Recorded first, so nothing Shopify accepts can be lost (lib/fulfillment/shipment-intents.ts).
  const shopifyRequired = !!order.shopify_id && !order.is_test_order;
  let intent;
  try {
    intent = await beginShipment({
      orderId: order.id,
      source: "erp",
      createdBy: null,
      trackingNumber,
      trackingCompany: carrier,
      trackingUrl,
      items: lines.map((l) => ({ orderItemId: l.item.id, quantity: l.quantity })),
      shopifyRequired,
      registerTracking: !order.is_test_order,
      sendEmail: !order.is_test_order,
    });
  } catch (err) {
    if (err instanceof ShipmentInProgressError) throw new ErpError(409, "shipment_in_progress", `${trackingNumber} is already being registered on ${orderNumber}; retry in a minute.`);
    throw err;
  }

  // 1) Shopify first (as admin does): if Shopify refuses, nothing is written and no email goes out.
  let shopifyFulfillmentId: string | null = null;
  if (shopifyRequired) {
    const missing = lines.find((l) => !l.item.shopify_id);
    if (missing) {
      await markShopifyFailed(intent.id, "line has no Shopify link");
      throw new ErpError(409, "line_not_in_shopify", `${missing.item.title}: line has no Shopify link.`);
    }
    const res = await createShopifyFulfillment({
      shopifyOrderId: order.shopify_id,
      lineItems: lines.map((l) => ({ shopifyLineItemId: l.item.shopify_id, quantity: l.quantity })),
      trackingNumber,
      trackingCompany: carrier,
      trackingUrl,
    });
    if (!res.ok) {
      await markShopifyFailed(intent.id, res.error);
      const nothingLeft = /inga artiklar kvar/i.test(res.error);
      throw new ErpError(nothingLeft ? 409 : 502, nothingLeft ? "nothing_to_fulfill" : "shopify_rejected", `Shopify: ${res.error}`);
    }
    shopifyFulfillmentId = res.shopifyFulfillmentId;
  }

  // 2) + 3) Supabase rows (same as admin's), 17TRACK and Jawhara's shipping email -- the last two
  // never for test orders.
  return finishShipment(order, intent.id, plan, shopifyFulfillmentId, carrier);
}

const carrierOf = (i: { tracking_company: string | null }) => i.tracking_company;

async function finishShipment(order: any, intentId: string, plan: any, shopifyFulfillmentId: string | null, carrier: string | null) {
  const done = await completeShipment(intentId, { shopifyFulfillmentId });

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
    detail: {
      fulfillmentId: done.fulfillmentId,
      shopifyFulfillmentId,
      trackingNumber: plan.trackingNumber,
      carrier,
      items: plan.items,
      customerNotified: done.done ? done.customerNotified : false,
      completed: done.done,
      ...(done.done ? {} : { pending: done.error }),
      testOrder: order.is_test_order,
    },
  });

  if (!done.done) {
    // Shopify has the shipment (or it is being finished); the remaining steps are finished
    // automatically within minutes. Sending the same request again is safe and finishes it.
    return {
      status: 202,
      body: {
        result: "accepted",
        orderNumber: order.order_number,
        trackingNumber: plan.trackingNumber,
        items: plan.items,
        message: "Shipment registered; the remaining steps are completed automatically within minutes. Retrying is safe.",
      },
    };
  }

  const { data: fulfillment } = await supabaseService
    .from("fulfillments")
    .select("id, tracking_number, tracking_company, tracking_url, shipped_at, created_at, delivered_at, shopify_id, shopify_fulfillment_id")
    .eq("id", done.fulfillmentId)
    .single();
  return {
    status: 201,
    body: { result: "created", shipment: { ...shipmentView(fulfillment, order.order_number), items: plan.items, customerNotified: done.customerNotified } },
  };
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
