"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Soft-delete only -- sets orders.hidden_at/hidden_by so the order drops out of the normal
 * list/search/dashboard views (lib/admin/orders-filters.ts defaults to excluding it). Never
 * touches order_items, payments, refunds, fulfillments, or audit_log -- financial/accounting
 * history and Stripe references stay fully intact, and nothing here calls Stripe at all.
 */
export async function hideOrders(orderIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (orderIds.length === 0) return { ok: false, error: "Inga ordrar valda." };

  const { error, data } = await supabaseService
    .from("orders")
    .update({ hidden_at: new Date().toISOString(), hidden_by: admin.adminId })
    .in("id", orderIds)
    .is("hidden_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const count = data?.length ?? 0;

  await logAdminAction(admin.adminId, "orders.hide", undefined, undefined, { orderIds, count });
  revalidatePath("/admin/orders");
  for (const id of orderIds) revalidatePath(`/admin/orders/${id}`);
  return { ok: true, count };
}

export async function unhideOrders(orderIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (orderIds.length === 0) return { ok: false, error: "Inga ordrar valda." };

  const { error, data } = await supabaseService
    .from("orders")
    .update({ hidden_at: null, hidden_by: null })
    .in("id", orderIds)
    .not("hidden_at", "is", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const count = data?.length ?? 0;

  await logAdminAction(admin.adminId, "orders.unhide", undefined, undefined, { orderIds, count });
  revalidatePath("/admin/orders");
  for (const id of orderIds) revalidatePath(`/admin/orders/${id}`);
  return { ok: true, count };
}
