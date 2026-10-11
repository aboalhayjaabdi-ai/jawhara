"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ReviewFormInput = {
  rating: number;
  authorName: string | null;
  body: string | null;
  verifiedBuyer: boolean;
  status: "pending" | "approved" | "rejected";
};

export async function updateReview(reviewId: string, input: ReviewFormInput): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (input.rating < 1 || input.rating > 5) return { ok: false, error: "Betyg måste vara mellan 1 och 5." };

  const { data: existing } = await supabaseService.from("reviews").select("status").eq("id", reviewId).maybeSingle();
  if (!existing) return { ok: false, error: "Recensionen hittades inte." };

  const statusChanged = existing.status !== input.status;

  const { error } = await supabaseService
    .from("reviews")
    .update({
      rating: input.rating,
      author_name: input.authorName?.trim() || null,
      body: input.body?.trim() || null,
      verified_buyer: input.verifiedBuyer,
      status: input.status,
      updated_at: new Date().toISOString(),
      ...(statusChanged ? { moderated_at: new Date().toISOString(), moderated_by: admin.adminId } : {}),
    })
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "reviews.update", "review", reviewId, { status: input.status, rating: input.rating });
  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/reviews/${reviewId}`);
  return { ok: true };
}

export async function setMerchantReply(reviewId: string, replyBody: string | null): Promise<ActionResult> {
  const admin = await requireAdmin();

  const trimmed = replyBody?.trim() || null;
  const { error } = await supabaseService
    .from("reviews")
    .update({
      merchant_reply_body: trimmed,
      merchant_reply_at: trimmed ? new Date().toISOString() : null,
      merchant_reply_by: trimmed ? admin.adminId : null,
    })
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, trimmed ? "reviews.reply" : "reviews.reply_removed", "review", reviewId, {});
  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/reviews/${reviewId}`);
  return { ok: true };
}

export async function deleteReview(reviewId: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { data: review } = await supabaseService.from("reviews").select("author_name").eq("id", reviewId).maybeSingle();
  const { error } = await supabaseService.from("reviews").delete().eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "reviews.delete", "review", reviewId, { authorName: review?.author_name });
  revalidatePath("/admin/reviews");
  return { ok: true };
}
