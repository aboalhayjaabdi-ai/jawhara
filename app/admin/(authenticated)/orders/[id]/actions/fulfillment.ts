"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";
import { beginShipment, completeShipment, markShopifyFailed, ShipmentInProgressError } from "@/lib/fulfillment/shipment-intents";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type FulfillmentLineInput = { orderItemId: string; quantity: number };

export async function createFulfillment(
  orderId: string,
  input: {
    items: FulfillmentLineInput[];
    trackingNumber?: string;
    trackingUrl?: string;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Carrier is never entered by hand -- this store ships exclusively via 4PX/YunExpress,
  // distinguishable by their tracking-number prefix (see lib/tracking/detect-carrier.ts).
  const trackingCompany = input.trackingNumber ? detectCarrierFromTrackingNumber(input.trackingNumber) : null;

  const requested = input.items.filter((i) => i.quantity > 0);
  if (requested.length === 0) return { ok: false, error: "Välj minst en artikel att leverera." };

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email, shipping_address_id, shopify_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };

  const { data: items } = await supabaseService
    .from("order_items")
    .select(
      "id, title, sku, shopify_id, quantity, fulfilled_quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, image_is_variant_specific, variant_title_snapshot, product_variants(title)"
    )
    .eq("order_id", orderId);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  for (const line of requested) {
    const item = itemById.get(line.orderItemId);
    if (!item) return { ok: false, error: "En artikel i leveransen hittades inte." };
    const remaining = item.quantity - item.fulfilled_quantity;
    if (line.quantity > remaining) {
      return { ok: false, error: `${item.title}: endast ${remaining} kvar att leverera.` };
    }
  }

  // Create the REAL Shopify fulfillment first -- notifyCustomer: false always, since Jawhara's
  // own branded email below (with the correct purchased-variant images) is the one and only
  // shipping email for a fulfillment created from this admin. If Shopify rejects this (nothing
  // left to fulfill there, a malformed tracking URL, a sync/auth error), stop here: no local
  // fulfillment row is written and no email is sent, so the order is never shown as shipped in
  // Jawhara when Shopify itself doesn't agree it shipped. An order with no shopify_id (a manual,
  // Jawhara-only order that was never pushed to Shopify) skips this entirely -- there is nothing
  // in Shopify to sync to.
  // Recorded before Shopify is called (lib/fulfillment/shipment-intents.ts), so a shipment Shopify
  // accepted is finished even if a later step fails here -- automatically, without a second
  // shipment or a second email.
  let intent;
  try {
    intent = await beginShipment({
      orderId,
      source: "admin",
      createdBy: admin.adminId,
      trackingNumber: input.trackingNumber || null,
      trackingCompany: trackingCompany || null,
      trackingUrl: input.trackingUrl || null,
      items: requested,
      shopifyRequired: !!order.shopify_id,
      registerTracking: true,
      // Always sent -- there is no option to skip it, for any admin role. Without a tracking number
      // yet, it is sent instead when one is first added (editFulfillmentTracking).
      sendEmail: !!input.trackingNumber,
    });
  } catch (err) {
    if (err instanceof ShipmentInProgressError) return { ok: false, error: "Leveransen med detta spårningsnummer registreras redan. Vänta en stund och ladda om sidan." };
    return { ok: false, error: "Kunde inte skapa leverans." };
  }

  let shopifyFulfillmentId: string | null = null;
  if (order.shopify_id) {
    const itemsWithShopifyId = requested.map((line) => ({ line, item: itemById.get(line.orderItemId)! }));
    const missingShopifyId = itemsWithShopifyId.find(({ item }) => !item.shopify_id);
    if (missingShopifyId) {
      await markShopifyFailed(intent.id, "line has no Shopify link");
      return {
        ok: false,
        error: `${missingShopifyId.item.title}: artikeln saknar Shopify-koppling och kan inte levereras via Shopify.`,
      };
    }
    const result = await createShopifyFulfillment({
      shopifyOrderId: order.shopify_id,
      lineItems: itemsWithShopifyId.map(({ line, item }) => ({ shopifyLineItemId: item.shopify_id!, quantity: line.quantity })),
      trackingNumber: input.trackingNumber || null,
      trackingCompany: trackingCompany || null,
      trackingUrl: input.trackingUrl || null,
    });
    if (!result.ok) {
      await markShopifyFailed(intent.id, result.error);
      return { ok: false, error: `Shopify nekade leveransen: ${result.error}` };
    }
    shopifyFulfillmentId = result.shopifyFulfillmentId;
  }

  // The fulfillment row (shopify_id: the bare numeric tail every table uses, shopify_fulfillment_id:
  // the full GID), its lines, fulfilled_quantity, the order's fulfillment_status, 17TRACK and the
  // shipping email -- all in completeShipment, each step done exactly once.
  const done = await completeShipment(intent.id, { shopifyFulfillmentId });
  const notified = done.done ? done.customerNotified : false;

  await logAdminAction(admin.adminId, "orders.create_fulfillment", "order", orderId, {
    fulfillmentId: done.fulfillmentId,
    shopifyFulfillmentId,
    items: requested,
    notified,
    ...(done.done ? {} : { pending: done.error }),
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
