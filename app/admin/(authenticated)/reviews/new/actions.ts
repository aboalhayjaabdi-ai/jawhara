"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { checkVerifiedPurchase } from "@/lib/admin/review-verified-purchase";

export type CreateReviewInput = {
  productId: string;
  rating: number;
  authorName: string | null;
  body: string | null;
  customerEmail: string | null;
  status: "pending" | "approved" | "rejected";
};

export type CreateReviewResult = { ok: true; reviewId: string } | { ok: false; error: string };

export async function createReview(input: CreateReviewInput): Promise<CreateReviewResult> {
  const admin = await requireAdmin();

  if (!input.productId) return { ok: false, error: "Välj en produkt." };
  if (input.rating < 1 || input.rating > 5) return { ok: false, error: "Betyg måste vara mellan 1 och 5." };

  const { data: product } = await supabaseService.from("products").select("id").eq("id", input.productId).maybeSingle();
  if (!product) return { ok: false, error: "Produkten hittades inte." };

  // "Verified purchase, where supported": only ever computed from real order data when a real
  // customer email is given -- never left to the admin's own say-so at creation time (see
  // lib/admin/review-verified-purchase.ts). With no email, the review is created unverified; the
  // verified-buyer flag can still be corrected manually afterward on the edit page, for
  // historical/out-of-band cases.
  const verifiedBuyer = input.customerEmail ? await checkVerifiedPurchase(input.customerEmail, input.productId) : false;

  const { data: inserted, error } = await supabaseService
    .from("reviews")
    .insert({
      product_id: input.productId,
      rating: input.rating,
      author_name: input.authorName?.trim() || null,
      body: input.body?.trim() || null,
      customer_email: input.customerEmail?.trim() || null,
      verified_buyer: verifiedBuyer,
      status: input.status,
      source: "manual",
      moderated_at: new Date().toISOString(),
      moderated_by: admin.adminId,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? "Kunde inte skapa recensionen." };

  await logAdminAction(admin.adminId, "reviews.create", "review", inserted.id, { productId: input.productId, rating: input.rating, verifiedBuyer });
  revalidatePath("/admin/reviews");
  return { ok: true, reviewId: inserted.id };
}
