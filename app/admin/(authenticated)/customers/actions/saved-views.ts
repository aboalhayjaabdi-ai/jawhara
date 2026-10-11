"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import type { CustomersListFilters } from "@/lib/admin/customers-filters";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * One mechanism serves both "saved customer views" and "customer segments based on purchase
 * behavior/location/spending/frequency" -- a segment is a saved view whose filters happen to be
 * stat-based (minTotalSpent, minOrderCount, country, ...). Shared across every admin, same
 * visibility model as every other admin-managed resource in this project.
 */
export async function createSavedView(name: string, filters: CustomersListFilters): Promise<ActionResult> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Namn krävs." };

  const { data, error } = await supabaseService
    .from("customer_saved_views")
    .insert({ name: trimmed, filters, created_by: admin.adminId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Kunde inte spara vyn." };

  await logAdminAction(admin.adminId, "customers.create_saved_view", "customer_saved_view", data.id, { name: trimmed, filters });
  revalidatePath("/admin/customers");
  return { ok: true, id: data.id };
}

export async function deleteSavedView(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("customer_saved_views").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.delete_saved_view", "customer_saved_view", id);
  revalidatePath("/admin/customers");
  return { ok: true };
}
