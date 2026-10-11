"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { restockOrderItems } from "@/lib/inventory/restock";

export type ActionResult = { ok: true } | { ok: false; error: string; needsConfirmation?: boolean };

export async function cancelOrder(orderId: string, reason: string, force: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { data: order } = await supabaseService.from("orders").select("id, cancelled_at, fulfillment_status").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };
  if (order.cancelled_at) return { ok: false, error: "Ordern är redan avbruten." };

  const { count: refundCount } = await supabaseService.from("refunds").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  if ((refundCount ?? 0) > 0) return { ok: false, error: "Kan inte avbryta en order som redan har en återbetalning." };

  const hasShipped = order.fulfillment_status === "FULFILLED" || order.fulfillment_status === "PARTIALLY_FULFILLED";
  if (hasShipped && !force) {
    return { ok: false, error: "Ordern har redan levererats helt eller delvis. Bekräfta för att avbryta ändå.", needsConfirmation: true };
  }

  const { data: items } = await supabaseService.from("order_items").select("variant_id, quantity, fulfilled_quantity").eq("order_id", orderId);
  // Restocking the unfulfilled remainder per line item is always correct, shipped or not: a fully
  // fulfilled item's remainder is already 0 (nothing to add back), and a never-fulfilled item's
  // remainder is its full quantity -- no separate "skip restock if shipped" branch is needed.
  await restockOrderItems((items ?? []).map((i) => ({ variantId: i.variant_id, quantity: i.quantity - i.fulfilled_quantity })));

  await supabaseService
    .from("orders")
    .update({ cancelled_at: new Date().toISOString(), cancel_reason: reason || null, cancelled_by: admin.adminId })
    .eq("id", orderId);

  await logAdminAction(admin.adminId, "orders.cancel", "order", orderId, { reason, force, hadShipped: hasShipped });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
