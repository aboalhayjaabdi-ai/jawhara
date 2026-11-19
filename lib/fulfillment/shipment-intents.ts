import { supabaseService } from "@/lib/supabase/service-client";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { sendShippingEmailForFulfillment } from "@/lib/email/fulfillment-shipping-email";
import { recomputeFulfilledQuantities } from "@/lib/shopify/fulfilled-quantities";
import { syncSingleShopifyOrder } from "@/lib/shopify/order-sync-shared";
import { storeForNode } from "@/lib/shopify/client";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

if (typeof window !== "undefined") {
  throw new Error("lib/fulfillment/shipment-intents.ts must never be imported into client code");
}

/**
 * Makes creating a shipment safe against a failure part-way through. The order of work is the same
 * as before (Shopify first, then Jawhara's own rows, 17TRACK and the shipping email), but a record
 * of the shipment -- the intent -- is written BEFORE Shopify is called. If anything after Shopify
 * fails (Supabase, 17TRACK, the email, the function being cut off), the intent says exactly what
 * is still to be done, and completeShipment() finishes it: in the same request, on a retry of the
 * same request, or from the 5-minute order sync (recoverShipmentIntents).
 *
 * Never twice: every step checks what is already there (the fulfillment row by its Shopify id or
 * the intent's own id, its lines, the 17TRACK cache, notification_sent_at, plus Resend's
 * idempotency key), only one runner works on an intent at a time (locked_until), and the same
 * tracking number can only be in flight once per order (unique index).
 */

export type ShipmentLine = { orderItemId: string; quantity: number };

export type ShipmentIntent = {
  id: string;
  order_id: string;
  source: "erp" | "admin" | "admin_bulk";
  created_by: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  items: ShipmentLine[];
  shopify_required: boolean;
  shopify_fulfillment_id: string | null;
  fulfillment_id: string | null;
  register_tracking: boolean;
  send_email: boolean;
  status: "pending" | "shopify_failed" | "shopify_created" | "completed" | "abandoned";
  customer_notified: boolean | null;
  attempts: number;
  created_at: string;
};

export type CompleteResult =
  // quantitiesPending: everything is done except recounting shipped quantities against Shopify,
  // which the 5-minute sync finishes (the intent stays open until then).
  | { done: true; fulfillmentId: string; customerNotified: boolean; quantitiesPending?: boolean }
  | { done: false; fulfillmentId: string | null; error: string };

const LOCK_MS = 2 * 60 * 1000;
// Recovery leaves fresh intents to the request that is still working on them.
const RECOVER_AFTER_MS = 2 * 60 * 1000;
// A pending intent with no Shopify shipment found by then never reached Shopify.
const ABANDON_PENDING_AFTER_MS = 30 * 60 * 1000;
// Older than this is not finished automatically (an email days late would confuse the customer);
// it is logged to integration_errors instead.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const idTail = (gid: string) => gid.split("/").pop()!;

export class ShipmentInProgressError extends Error {}

/** Records the shipment before Shopify is called. Throws ShipmentInProgressError when the same
 * tracking number is already being registered on this order. */
export async function beginShipment(input: {
  orderId: string;
  source: ShipmentIntent["source"];
  createdBy: string | null;
  trackingNumber: string | null;
  trackingCompany: string | null;
  trackingUrl: string | null;
  items: ShipmentLine[];
  shopifyRequired: boolean;
  registerTracking: boolean;
  sendEmail: boolean;
}): Promise<ShipmentIntent> {
  const { data, error } = await supabaseService
    .from("shipment_intents")
    .insert({
      order_id: input.orderId,
      source: input.source,
      created_by: input.createdBy,
      tracking_number: input.trackingNumber,
      tracking_company: input.trackingCompany,
      tracking_url: input.trackingUrl,
      items: input.items,
      shopify_required: input.shopifyRequired,
      register_tracking: input.registerTracking,
      send_email: input.sendEmail,
    })
    .select("*")
    .single();
  if (error?.code === "23505") throw new ShipmentInProgressError("A shipment with this tracking number is already being registered on this order.");
  if (error || !data) throw new Error(`could not record shipment: ${error?.message}`);
  return data as ShipmentIntent;
}

/** Shopify refused the shipment: nothing was created anywhere, nothing to finish. */
export async function markShopifyFailed(intentId: string, error: string): Promise<void> {
  await supabaseService
    .from("shipment_intents")
    .update({ status: "shopify_failed", last_error: error.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", intentId);
}

/** An unfinished intent for this tracking number on this order, if any (for resuming on a retry). */
export async function findOpenIntent(orderId: string, trackingNumber: string): Promise<ShipmentIntent | null> {
  const { data } = await supabaseService
    .from("shipment_intents")
    .select("*")
    .eq("order_id", orderId)
    .ilike("tracking_number", trackingNumber)
    .in("status", ["pending", "shopify_created"])
    .limit(1)
    .maybeSingle();
  return (data as ShipmentIntent) ?? null;
}

async function claim(intentId: string): Promise<ShipmentIntent | null> {
  const now = new Date();
  const { data } = await supabaseService
    .from("shipment_intents")
    .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString(), updated_at: now.toISOString() })
    .eq("id", intentId)
    .in("status", ["pending", "shopify_created"])
    .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
    .select("*")
    .maybeSingle();
  return (data as ShipmentIntent) ?? null;
}

async function release(intent: ShipmentIntent, patch: Record<string, unknown>): Promise<void> {
  await supabaseService
    .from("shipment_intents")
    .update({ ...patch, attempts: intent.attempts + 1, locked_until: null, updated_at: new Date().toISOString() })
    .eq("id", intent.id);
}

/**
 * The Shopify shipment of a pending intent whose Shopify call was cut off before its answer was
 * saved: the shipment the order sync brought in from Shopify for this order since the intent was
 * written, with the same tracking number, that no Jawhara shipment has claimed yet.
 */
async function findShopifyShipmentFor(intent: ShipmentIntent): Promise<string | null> {
  const since = new Date(new Date(intent.created_at).getTime() - 2 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseService
    .from("fulfillments")
    .select("id, shopify_id, shopify_fulfillment_id, tracking_number, fulfillment_items(id)")
    .eq("order_id", intent.order_id)
    .not("shopify_id", "is", null)
    .neq("status", "CANCELLED")
    .gte("created_at", since);
  const sameTracking = (rows ?? []).filter((r: any) =>
    intent.tracking_number ? (r.tracking_number ?? "").toUpperCase() === intent.tracking_number.toUpperCase() : !r.tracking_number
  );
  for (const r of sameTracking as any[]) {
    if ((r.fulfillment_items ?? []).length > 0) continue; // already some Jawhara shipment's
    const { data: other } = await supabaseService.from("shipment_intents").select("id").eq("fulfillment_id", r.id).neq("id", intent.id).limit(1);
    if (other && other.length) continue;
    return r.shopify_fulfillment_id ?? `gid://shopify/Fulfillment/${r.shopify_id}`;
  }
  return null;
}

/** The fulfillment row for this intent: found by the intent's own record, by its Shopify id (the
 * order-sync webhook may have saved it first), or created -- never a second one. */
async function ensureFulfillmentRow(intent: ShipmentIntent): Promise<string> {
  if (intent.fulfillment_id) return intent.fulfillment_id;
  const shopifyTail = intent.shopify_fulfillment_id ? idTail(intent.shopify_fulfillment_id) : null;

  const find = async () => {
    const q = supabaseService.from("fulfillments").select("id, created_by, tracking_number, shipped_at");
    const { data } = shopifyTail ? await q.eq("shopify_id", shopifyTail).maybeSingle() : await q.eq("id", intent.id).maybeSingle();
    return data as { id: string; created_by: string | null; tracking_number: string | null; shipped_at: string | null } | null;
  };

  let row = await find();
  let inserted = false;
  if (!row) {
    const { error } = await supabaseService.from("fulfillments").insert({
      // The intent's id doubles as the row id, so a retry after a lost answer finds this row.
      id: intent.id,
      order_id: intent.order_id,
      status: "SUCCESS",
      tracking_number: intent.tracking_number,
      tracking_company: intent.tracking_company,
      tracking_url: intent.tracking_url,
      shipped_at: intent.created_at,
      created_by: intent.created_by,
      shopify_id: shopifyTail,
      shopify_fulfillment_id: intent.shopify_fulfillment_id,
    });
    if (error && error.code !== "23505") throw new Error(`fulfillment insert failed: ${error.message}`);
    inserted = !error;
    row = await find();
    if (!row) throw new Error("fulfillment row missing after insert");
  }
  if (!inserted && shopifyTail) {
    // Saved first by the order sync (from Shopify): add what only Jawhara knows.
    await supabaseService
      .from("fulfillments")
      .update({
        shopify_fulfillment_id: intent.shopify_fulfillment_id,
        ...(row.created_by ? {} : { created_by: intent.created_by }),
        ...(row.shipped_at ? {} : { shipped_at: intent.created_at }),
        ...(row.tracking_number ? {} : { tracking_number: intent.tracking_number, tracking_company: intent.tracking_company, tracking_url: intent.tracking_url }),
      })
      .eq("id", row.id);
  }
  await supabaseService.from("shipment_intents").update({ fulfillment_id: row.id }).eq("id", intent.id);
  intent.fulfillment_id = row.id;
  return row.id;
}

async function ensureFulfillmentItems(intent: ShipmentIntent, fulfillmentId: string): Promise<void> {
  const { data: existing, error } = await supabaseService.from("fulfillment_items").select("id").eq("fulfillment_id", fulfillmentId).limit(1);
  if (error) throw new Error(`fulfillment_items read failed: ${error.message}`);
  if (existing && existing.length) return;
  const { error: insertError } = await supabaseService
    .from("fulfillment_items")
    .insert(intent.items.map((l) => ({ fulfillment_id: fulfillmentId, order_item_id: l.orderItemId, quantity: l.quantity })));
  if (insertError) throw new Error(`fulfillment_items insert failed: ${insertError.message}`);
}

async function ensureTrackingRegistered(intent: ShipmentIntent, fulfillmentId: string): Promise<void> {
  if (!intent.register_tracking || !intent.tracking_number) return;
  // Same check the order sync uses: a shipment already in the tracking cache is never registered
  // with 17TRACK again.
  const { data: cached } = await supabaseService.from("tracking_cache").select("fulfillment_id").eq("fulfillment_id", fulfillmentId).limit(1);
  if (cached && cached.length) return;
  await registerFulfillmentsForTracking([{ id: fulfillmentId, trackingNumber: intent.tracking_number, trackingCompany: intent.tracking_company }]);
}

// Retries of a failing shipping email (about an hour at the 5-minute sync) before the shipment is
// completed without it and the failure is left in integration_errors (written by sendEmail).
const MAX_EMAIL_ATTEMPTS = 12;

async function ensureEmailSent(intent: ShipmentIntent, fulfillmentId: string): Promise<boolean> {
  if (!intent.send_email || !intent.tracking_number) return false;
  const { data: f } = await supabaseService
    .from("fulfillments")
    .select("notification_sent_at, orders!inner(email)")
    .eq("id", fulfillmentId)
    .maybeSingle();
  if (f?.notification_sent_at) return true;
  if (!(f as any)?.orders?.email) return false; // no address to send to -- exactly as before
  const sent = await sendShippingEmailForFulfillment(fulfillmentId);
  if (sent) return true;
  if (intent.attempts + 1 >= MAX_EMAIL_ATTEMPTS) return false;
  throw new Error("shipping email not sent yet");
}

/** Same rule every shipment path has always used for the order's own fulfillment status. */
async function updateOrderFulfillmentStatus(orderId: string): Promise<void> {
  const { data: items } = await supabaseService.from("order_items").select("quantity, fulfilled_quantity").eq("order_id", orderId);
  const all = (items ?? []).every((i) => i.fulfilled_quantity >= i.quantity);
  const any = (items ?? []).some((i) => i.fulfilled_quantity > 0);
  await supabaseService.from("orders").update({ fulfillment_status: all ? "FULFILLED" : any ? "PARTIALLY_FULFILLED" : "UNFULFILLED" }).eq("id", orderId);
}

/**
 * Finishes a shipment: everything after Shopify. Safe to call any number of times, from anywhere.
 * `shopifyFulfillmentId`: what Shopify just answered, when called right after createShopifyFulfillment.
 */
export async function completeShipment(intentId: string, opts: { shopifyFulfillmentId?: string | null } = {}): Promise<CompleteResult> {
  if (opts.shopifyFulfillmentId) {
    // Saved before anything else, so a failure from here on is always recoverable.
    await supabaseService
      .from("shipment_intents")
      .update({ shopify_fulfillment_id: opts.shopifyFulfillmentId, status: "shopify_created", updated_at: new Date().toISOString() })
      .eq("id", intentId)
      .in("status", ["pending", "shopify_created"]);
  }

  const intent = await claim(intentId);
  if (!intent) {
    const { data } = await supabaseService.from("shipment_intents").select("status, fulfillment_id, customer_notified").eq("id", intentId).maybeSingle();
    if (data?.status === "completed") return { done: true, fulfillmentId: data.fulfillment_id, customerNotified: !!data.customer_notified };
    return { done: false, fulfillmentId: data?.fulfillment_id ?? null, error: "being finished by another request" };
  }
  if (opts.shopifyFulfillmentId && !intent.shopify_fulfillment_id) {
    intent.shopify_fulfillment_id = opts.shopifyFulfillmentId;
    intent.status = "shopify_created";
  }

  try {
    if (intent.shopify_required && !intent.shopify_fulfillment_id) {
      const found = await findShopifyShipmentFor(intent);
      if (!found) {
        const age = Date.now() - new Date(intent.created_at).getTime();
        if (age < ABANDON_PENDING_AFTER_MS) {
          await release(intent, { last_error: "waiting for the Shopify shipment to appear" });
          return { done: false, fulfillmentId: null, error: "Shopify shipment not found yet" };
        }
        await release(intent, { status: "abandoned", last_error: "no Shopify shipment was created" });
        return { done: false, fulfillmentId: null, error: "no Shopify shipment was created" };
      }
      intent.shopify_fulfillment_id = found;
      await supabaseService.from("shipment_intents").update({ shopify_fulfillment_id: found, status: "shopify_created" }).eq("id", intent.id);
    }

    const fulfillmentId = await ensureFulfillmentRow(intent);
    await ensureFulfillmentItems(intent, fulfillmentId);
    await ensureTrackingRegistered(intent, fulfillmentId);
    const customerNotified = await ensureEmailSent(intent, fulfillmentId);
    try {
      await recomputeFulfilledQuantities(intent.order_id, { expectShopifyFulfillmentId: intent.shopify_fulfillment_id });
      await updateOrderFulfillmentStatus(intent.order_id);
    } catch (err) {
      await release(intent, { last_error: `quantities: ${(err as Error).message}`.slice(0, 500), customer_notified: customerNotified });
      return { done: true, fulfillmentId, customerNotified, quantitiesPending: true };
    }

    await release(intent, { status: "completed", completed_at: new Date().toISOString(), customer_notified: customerNotified, last_error: null });
    return { done: true, fulfillmentId, customerNotified };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await release(intent, { last_error: message });
    return { done: false, fulfillmentId: intent.fulfillment_id, error: message };
  }
}

/**
 * Finishes every shipment left unfinished (run by the 5-minute order sync,
 * app/api/cron/sync-orders, right after it has brought Shopify's shipments in). Never throws.
 */
export async function recoverShipmentIntents(limit = 20): Promise<{ checked: number; completed: number; failed: number }> {
  const result = { checked: 0, completed: 0, failed: 0 };
  try {
    const { data: open } = await supabaseService
      .from("shipment_intents")
      .select("id, order_id, created_at, shopify_required, shopify_fulfillment_id, status")
      .in("status", ["pending", "shopify_created"])
      .lt("created_at", new Date(Date.now() - RECOVER_AFTER_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    for (const i of (open ?? []) as any[]) {
      result.checked += 1;
      if (Date.now() - new Date(i.created_at).getTime() > MAX_AGE_MS) {
        await supabaseService
          .from("shipment_intents")
          .update({ status: "abandoned", last_error: "too old to finish automatically", updated_at: new Date().toISOString() })
          .eq("id", i.id);
        await logIntegrationError("cron_sync", "Unfinished shipment older than 3 days -- check it in admin", { intentId: i.id }, i.order_id);
        result.failed += 1;
        continue;
      }
      // A cut-off Shopify call: bring the order's Shopify shipments in first, so the one Shopify
      // did create (if any) can be found.
      if (i.shopify_required && !i.shopify_fulfillment_id) {
        const { data: order } = await supabaseService.from("orders").select("shopify_id").eq("id", i.order_id).maybeSingle();
        if (order?.shopify_id) {
          const gid = `gid://shopify/Order/${order.shopify_id}`;
          const store = await storeForNode(gid);
          if (store) await syncSingleShopifyOrder(gid, store).catch(() => null);
        }
      }
      const r = await completeShipment(i.id);
      if (r.done && !r.quantitiesPending) result.completed += 1;
      else {
        result.failed += 1;
        console.error(`Shipment intent ${i.id} not finished yet: ${r.done ? "shipped quantities pending" : r.error}`);
      }
    }
  } catch (err) {
    console.error("recoverShipmentIntents failed:", err);
    await logIntegrationError("cron_sync", `shipment recovery failed: ${(err as Error).message}`);
  }
  return result;
}
