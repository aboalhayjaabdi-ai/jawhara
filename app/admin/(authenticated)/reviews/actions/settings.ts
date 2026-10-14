"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export async function getReviewRequestEmailsEnabled(): Promise<boolean> {
  const { data } = await supabaseService.from("store_settings").select("value").eq("key", "review_request_emails_enabled").single();
  return data?.value === true;
}

export async function setReviewRequestEmailsEnabled(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const { error } = await supabaseService
    .from("store_settings")
    .update({ value: enabled, updated_at: new Date().toISOString() })
    .eq("key", "review_request_emails_enabled");
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, enabled ? "reviews.enable_request_emails" : "reviews.disable_request_emails", undefined, undefined, {});
  revalidatePath("/admin/reviews");
  return { ok: true };
}
