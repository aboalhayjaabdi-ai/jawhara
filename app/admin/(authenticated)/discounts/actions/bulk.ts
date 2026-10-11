"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

export async function bulkSetDiscountStatus(discountIds: string[], status: "active" | "draft"): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (discountIds.length === 0) return { ok: false, error: "Inga rabatter valda." };

  const { error } = await supabaseService.from("discounts").update({ status }).in("id", discountIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.bulk_set_status", undefined, undefined, { discountIds, status });
  revalidatePath("/admin/discounts");
  return { ok: true, count: discountIds.length };
}

export async function bulkDeleteDiscounts(discountIds: string[], confirmed: boolean): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (discountIds.length === 0) return { ok: false, error: "Inga rabatter valda." };
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { error } = await supabaseService.from("discounts").delete().in("id", discountIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.bulk_delete", undefined, undefined, { discountIds });
  revalidatePath("/admin/discounts");
  return { ok: true, count: discountIds.length };
}
