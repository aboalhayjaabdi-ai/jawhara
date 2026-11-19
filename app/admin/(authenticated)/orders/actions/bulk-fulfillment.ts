"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";
import { beginShipment, completeShipment, markShopifyFailed } from "@/lib/fulfillment/shipment-intents";

export type BulkFulfillResult = { ok: true; fulfilled: number; skipped: string[] } | { ok: false; error: string };

/**
 * Fulfills every remaining unfulfilled line item per order, with no tracking-number input --
 * collecting N distinct tracking numbers in one bulk action is its own UI problem, deliberately
 * left for the single-order fulfillment form (components/admin/fulfillment-form.tsx) instead.
 *
 * Same rule as that single-order action: an order with a shopify_id gets a REAL Shopify
 * fulfillment created first (notifyCustomer: false -- Jawhara's own shipping email is the one and
 * only shipping email), and is skipped (not marked fulfilled locally, no email sent) if Shopify
 * rejects it.
 */
export async function bulkFulfillOrders(orderIds: string[]): Promise<BulkFulfillResult> {
  const admin = await requireAdmin();
  if (orderIds.length === 0) return { ok: false, error: "Inga ordrar valda." };

  let fulfilled = 0;
  const skipped: string[] = [];

  for (const orderId of orderIds) {
    const { data: order } = await supabaseService.from("orders").select("id, order_number, email, cancelled_at, shopify_id").eq("id", orderId).maybeSingle();
    if (!order || order.cancelled_at) {
      skipped.push(orderId);
      continue;
    }

    const { data: items } = await supabaseService
      .from("order_items")
      .select("id, title, shopify_id, quantity, fulfilled_quantity, unit_price, discounted_unit_price, variant_id, product_id, image_url, variant_title_snapshot, product_variants(title)")
      .eq("order_id", orderId);
    const remaining = (items ?? []).filter((i) => i.quantity - i.fulfilled_quantity > 0);
    if (remaining.length === 0) {
      skipped.push(orderId);
      continue;
    }

    if (order.shopify_id && remaining.some((i) => !i.shopify_id)) {
      skipped.push(orderId);
      continue;
    }

    // Recorded before Shopify is called (lib/fulfillment/shipment-intents.ts), so a shipment Shopify
    // accepted is finished even if a later step fails.
    const intent = await beginShipment({
      orderId,
      source: "admin_bulk",
      createdBy: admin.adminId,
      trackingNumber: null,
      trackingCompany: null,
      trackingUrl: null,
      items: remaining.map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.fulfilled_quantity })),
      shopifyRequired: !!order.shopify_id,
      registerTracking: false,
      sendEmail: false,
    }).catch(() => null);
    if (!intent) {
      skipped.push(orderId);
      continue;
    }

    let shopifyFulfillmentId: string | null = null;
    if (order.shopify_id) {
      const result = await createShopifyFulfillment({
        shopifyOrderId: order.shopify_id,
        lineItems: remaining.map((i) => ({ shopifyLineItemId: i.shopify_id!, quantity: i.quantity - i.fulfilled_quantity })),
      });
      if (!result.ok) {
        await markShopifyFailed(intent.id, result.error);
        skipped.push(orderId);
        continue;
      }
      shopifyFulfillmentId = result.shopifyFulfillmentId;
    }

    // The fulfillment row, its lines, fulfilled_quantity and the order's fulfillment_status, each
    // done exactly once (finished automatically later if a step fails now).
    await completeShipment(intent.id, { shopifyFulfillmentId });

    // Bulk shipments carry no tracking number, so the shipping email (always with its tracking
    // number) goes out when tracking is added to each one (editFulfillmentTracking).

    fulfilled += 1;
  }

  await logAdminAction(admin.adminId, "orders.bulk_fulfill", undefined, undefined, { orderIds, fulfilled, skipped });
  revalidatePath("/admin/orders");
  return { ok: true, fulfilled, skipped };
}
