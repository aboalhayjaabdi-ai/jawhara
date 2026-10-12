"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateOrderNote(orderId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  const { error } = await supabaseService.from("orders").update({ note: note.trim() || null }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "orders.update_note", "order", orderId, { note });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

export async function updateOrderTags(orderId: string, tags: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  const { error } = await supabaseService.from("orders").update({ tags: cleaned }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "orders.update_tags", "order", orderId, { tags: cleaned });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}
