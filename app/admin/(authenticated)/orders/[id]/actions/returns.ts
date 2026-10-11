"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { restockOrderItems } from "@/lib/inventory/restock";

export type ReturnLineInput = { orderItemId: string; quantity: number; restock: boolean };
export type ActionResult = { ok: true; returnId: string } | { ok: false; error: string };

/**
 * Exchanges are modeled as a return (this action, restocking the returned item) plus a separate
 * linked manual order for the replacement item -- not an automated in-place swap. A true swap needs
 * its own price-difference/partial-payment logic; two simple, already-built primitives (a return
 * here, a manual order via createManualOrder) cover the real need without building that.
 */
export async function createReturn(
  orderId: string,
  input: { reason?: string; resolution: "refund" | "exchange" | "none"; items: ReturnLineInput[] }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const lines = input.items.filter((i) => i.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Välj minst en artikel att returnera." };

  const { data: items } = await supabaseService.from("order_items").select("id, quantity, variant_id").eq("order_id", orderId);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  for (const line of lines) {
    const item = itemById.get(line.orderItemId);
    if (!item) return { ok: false, error: "En artikel i returen hittades inte." };
    if (line.quantity > item.quantity) return { ok: false, error: "Returantalet överstiger ordrens antal." };
  }

  const { data: returnRow, error } = await supabaseService
    .from("returns")
    .insert({ order_id: orderId, reason: input.reason || null, resolution: input.resolution, status: "approved", created_by: admin.adminId })
    .select("id")
    .single();
  if (error || !returnRow) return { ok: false, error: error?.message ?? "Kunde inte skapa returen." };

  await supabaseService.from("return_items").insert(
    lines.map((line) => ({ return_id: returnRow.id, order_item_id: line.orderItemId, quantity: line.quantity, restock: line.restock }))
  );

  const toRestock = lines.filter((l) => l.restock);
  if (toRestock.length > 0) {
    await restockOrderItems(toRestock.map((l) => ({ variantId: itemById.get(l.orderItemId)!.variant_id, quantity: l.quantity })));
    await supabaseService.from("returns").update({ restocked_at: new Date().toISOString() }).eq("id", returnRow.id);
  }

  await logAdminAction(admin.adminId, "orders.create_return", "order", orderId, { returnId: returnRow.id, resolution: input.resolution, items: lines });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, returnId: returnRow.id };
}
