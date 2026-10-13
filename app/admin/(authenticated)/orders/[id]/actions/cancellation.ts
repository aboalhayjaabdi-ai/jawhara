"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { restockOrderItems } from "@/lib/inventory/restock";
import { sendOrderCancellationEmail } from "@/lib/email/order-cancellation";
import { buildEmailLineItems } from "@/lib/email/build-line-items";

export type ActionResult = { ok: true } | { ok: false; error: string; needsConfirmation?: boolean };

export async function cancelOrder(orderId: string, reason: string, force: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email, cancelled_at, fulfillment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };
  if (order.cancelled_at) return { ok: false, error: "Ordern är redan avbruten." };

  const { count: refundCount } = await supabaseService.from("refunds").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  if ((refundCount ?? 0) > 0) return { ok: false, error: "Kan inte avbryta en order som redan har en återbetalning." };

  const hasShipped = order.fulfillment_status === "FULFILLED" || order.fulfillment_status === "PARTIALLY_FULFILLED";
  if (hasShipped && !force) {
    return { ok: false, error: "Ordern har redan levererats helt eller delvis. Bekräfta för att avbryta ändå.", needsConfirmation: true };
  }

  const { data: items } = await supabaseService
    .from("order_items")
    .select("id, title, variant_id, product_id, quantity, fulfilled_quantity, unit_price, discounted_unit_price, product_variants(title)")
    .eq("order_id", orderId);
  // Restocking the unfulfilled remainder per line item is always correct, shipped or not: a fully
  // fulfilled item's remainder is already 0 (nothing to add back), and a never-fulfilled item's
  // remainder is its full quantity -- no separate "skip restock if shipped" branch is needed.
  await restockOrderItems(
    (items ?? []).map((i) => ({ variantId: i.variant_id, quantity: i.quantity - i.fulfilled_quantity })),
    { reason: "cancellation", orderId, actorId: admin.adminId }
  );

  await supabaseService
    .from("orders")
    .update({ cancelled_at: new Date().toISOString(), cancel_reason: reason || null, cancelled_by: admin.adminId })
    .eq("id", orderId);

  if (order.email) {
    const lineItems = await buildEmailLineItems(
      (items ?? []).map((i: any) => ({
        id: i.id,
        title: i.title,
        quantity: i.quantity,
        unitPrice: Number(i.discounted_unit_price ?? i.unit_price),
        variantId: i.variant_id,
        productId: i.product_id,
        variantTitle: i.product_variants?.title ?? null,
      }))
    );
    await sendOrderCancellationEmail({ to: order.email, orderNumber: order.order_number, items: lineItems, reason: reason || null });
  }

  await logAdminAction(admin.adminId, "orders.cancel", "order", orderId, { reason, force, hadShipped: hasShipped });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
