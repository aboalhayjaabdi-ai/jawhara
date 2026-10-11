"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

export async function bulkSetReviewStatus(reviewIds: string[], status: "pending" | "approved" | "rejected"): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (reviewIds.length === 0) return { ok: false, error: "Inga recensioner valda." };

  const { error } = await supabaseService
    .from("reviews")
    .update({ status, moderated_at: new Date().toISOString(), moderated_by: admin.adminId })
    .in("id", reviewIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "reviews.bulk_set_status", undefined, undefined, { reviewIds, status });
  revalidatePath("/admin/reviews");
  return { ok: true, count: reviewIds.length };
}

export async function bulkDeleteReviews(reviewIds: string[], confirmed: boolean): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (reviewIds.length === 0) return { ok: false, error: "Inga recensioner valda." };
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { error } = await supabaseService.from("reviews").delete().in("id", reviewIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "reviews.bulk_delete", undefined, undefined, { reviewIds });
  revalidatePath("/admin/reviews");
  return { ok: true, count: reviewIds.length };
}
