"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendShippingConfirmationEmail } from "@/lib/email/shipping-confirmation";
import { buildEmailLineItems } from "@/lib/email/build-line-items";
import { createShopifyFulfillment } from "@/lib/shopify/fulfillment-sync";

export type BulkFulfillResult = { ok: true; fulfilled: number; skipped: string[] } | { ok: false; error: string };

/**
 * Fulfills every remaining unfulfilled line item per order, with no tracking-number input --
 * collecting N distinct tracking numbers in one bulk action is its own UI problem, deliberately
 * left for the single-order fulfillment form (components/admin/fulfillment-form.tsx) instead.
 *
 * Same rule as that single-order action: an order with a shopify_id gets a REAL Shopify
 * fulfillment created first (notifyCustomer: false -- Jawhara's own email below is the one and
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

    let shopifyFulfillmentId: string | null = null;
    if (order.shopify_id) {
      if (remaining.some((i) => !i.shopify_id)) {
        skipped.push(orderId);
        continue;
      }
      const result = await createShopifyFulfillment({
        shopifyOrderId: order.shopify_id,
        lineItems: remaining.map((i) => ({ shopifyLineItemId: i.shopify_id!, quantity: i.quantity - i.fulfilled_quantity })),
      });
      if (!result.ok) {
        skipped.push(orderId);
        continue;
      }
      shopifyFulfillmentId = result.shopifyFulfillmentId;
    }

    const { data: fulfillment } = await supabaseService
      .from("fulfillments")
      .insert({
        order_id: orderId,
        status: "SUCCESS",
        shipped_at: new Date().toISOString(),
        created_by: admin.adminId,
        shopify_id: shopifyFulfillmentId ? shopifyFulfillmentId.split("/").pop() : null,
        shopify_fulfillment_id: shopifyFulfillmentId,
      })
      .select("id")
      .single();
    if (!fulfillment) {
      skipped.push(orderId);
      continue;
    }

    await supabaseService
      .from("fulfillment_items")
      .insert(remaining.map((i) => ({ fulfillment_id: fulfillment.id, order_item_id: i.id, quantity: i.quantity - i.fulfilled_quantity })));
    for (const item of remaining) {
      await supabaseService.from("order_items").update({ fulfilled_quantity: item.quantity }).eq("id", item.id);
    }
    await supabaseService.from("orders").update({ fulfillment_status: "FULFILLED" }).eq("id", orderId);

    if (order.email) {
      const lineItems = await buildEmailLineItems(
        remaining.map((i: any) => ({
          id: i.id,
          title: i.title,
          quantity: i.quantity - i.fulfilled_quantity,
          unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
          variantId: i.variant_id,
          productId: i.product_id,
          variantTitle: i.product_variants?.title ?? null,
          imageUrlSnapshot: i.image_url,
          variantTitleSnapshot: i.variant_title_snapshot,
        }))
      );
      await sendShippingConfirmationEmail({
        to: order.email,
        orderId,
        orderNumber: order.order_number,
        items: lineItems,
        shippingAddress: null,
      });
      await supabaseService.from("fulfillments").update({ notification_sent_at: new Date().toISOString() }).eq("id", fulfillment.id);
    }

    fulfilled += 1;
  }

  await logAdminAction(admin.adminId, "orders.bulk_fulfill", undefined, undefined, { orderIds, fulfilled, skipped });
  revalidatePath("/admin/orders");
  return { ok: true, fulfilled, skipped };
}
