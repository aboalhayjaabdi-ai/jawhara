"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { updateShopifyFulfillmentTracking, cancelShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";
import { registerFulfillmentsForTracking } from "@/lib/tracking/lookup";
import { detectCarrierFromTrackingNumber } from "@/lib/tracking/detect-carrier";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Edits an existing fulfillment's tracking number/URL -- pushes the change to Shopify FIRST
 * (when this fulfillment has one, i.e. was created for a real Shopify order) and only updates
 * Supabase once Shopify confirms it, same "never show a change as applied when Shopify rejected
 * it" rule as creating a fulfillment. notifyCustomer stays false: this never sends a second
 * email, it only corrects the tracking info the one shipping email already sent pointed to.
 */
export async function editFulfillmentTracking(
  fulfillmentId: string,
  orderId: string,
  input: { trackingNumber: string; trackingUrl?: string }
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { data: fulfillment } = await supabaseService
    .from("fulfillments")
    .select("id, order_id, shopify_fulfillment_id, status")
    .eq("id", fulfillmentId)
    .maybeSingle();
  if (!fulfillment || fulfillment.order_id !== orderId) return { ok: false, error: "Leveransen hittades inte." };
  if (fulfillment.status === "CANCELLED") return { ok: false, error: "En avbruten leverans kan inte redigeras." };

  const trackingCompany = detectCarrierFromTrackingNumber(input.trackingNumber);

  if (fulfillment.shopify_fulfillment_id) {
    const result = await updateShopifyFulfillmentTracking({
      shopifyFulfillmentId: fulfillment.shopify_fulfillment_id,
      trackingNumber: input.trackingNumber,
      trackingCompany,
      trackingUrl: input.trackingUrl || null,
    });
    if (!result.ok) return { ok: false, error: `Shopify nekade ändringen: ${result.error}` };
  }

  await supabaseService
    .from("fulfillments")
    .update({ tracking_number: input.trackingNumber, tracking_company: trackingCompany, tracking_url: input.trackingUrl || null })
    .eq("id", fulfillmentId);
  await registerFulfillmentsForTracking([{ id: fulfillmentId, trackingNumber: input.trackingNumber, trackingCompany }]);

  await logAdminAction(admin.adminId, "orders.edit_fulfillment_tracking", "order", orderId, { fulfillmentId, trackingNumber: input.trackingNumber });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

/**
 * Cancels a fulfillment -- pushes the cancellation to Shopify FIRST (reopens its fulfillment
 * orders there so the items can be fulfilled again) and only then restores the local
 * fulfilled_quantity bookkeeping and recomputes the order's fulfillment_status. A fulfillment
 * with no shopify_fulfillment_id (a manual/non-Shopify order) just does the local part.
 */
export async function cancelFulfillment(fulfillmentId: string, orderId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { data: fulfillment } = await supabaseService
    .from("fulfillments")
    .select("id, order_id, shopify_fulfillment_id, status")
    .eq("id", fulfillmentId)
    .maybeSingle();
  if (!fulfillment || fulfillment.order_id !== orderId) return { ok: false, error: "Leveransen hittades inte." };
  if (fulfillment.status === "CANCELLED") return { ok: false, error: "Leveransen är redan avbruten." };

  if (fulfillment.shopify_fulfillment_id) {
    const result = await cancelShopifyFulfillment(fulfillment.shopify_fulfillment_id);
    if (!result.ok) return { ok: false, error: `Shopify nekade avbrytningen: ${result.error}` };
  }

  const { data: fulfillmentItems } = await supabaseService
    .from("fulfillment_items")
    .select("order_item_id, quantity")
    .eq("fulfillment_id", fulfillmentId);

  await supabaseService.from("fulfillments").update({ status: "CANCELLED" }).eq("id", fulfillmentId);

  for (const line of fulfillmentItems ?? []) {
    const { data: item } = await supabaseService.from("order_items").select("fulfilled_quantity").eq("id", line.order_item_id).maybeSingle();
    if (item) {
      await supabaseService
        .from("order_items")
        .update({ fulfilled_quantity: Math.max(0, item.fulfilled_quantity - line.quantity) })
        .eq("id", line.order_item_id);
    }
  }

  const { data: refreshedItems } = await supabaseService.from("order_items").select("quantity, fulfilled_quantity").eq("order_id", orderId);
  const allFulfilled = (refreshedItems ?? []).every((i) => i.fulfilled_quantity >= i.quantity);
  const anyFulfilled = (refreshedItems ?? []).some((i) => i.fulfilled_quantity > 0);
  const newStatus = allFulfilled && (refreshedItems ?? []).length > 0 ? "FULFILLED" : anyFulfilled ? "PARTIALLY_FULFILLED" : "UNFULFILLED";
  await supabaseService.from("orders").update({ fulfillment_status: newStatus }).eq("id", orderId);

  await logAdminAction(admin.adminId, "orders.cancel_fulfillment", "order", orderId, { fulfillmentId });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
