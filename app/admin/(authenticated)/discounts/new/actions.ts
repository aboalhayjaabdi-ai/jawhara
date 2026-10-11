"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type CreateDiscountResult = { ok: true; discountId: string } | { ok: false; error: string };

export async function createDiscount(input: { title: string; kind: "automatic" | "code"; code?: string }): Promise<CreateDiscountResult> {
  const admin = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titel krävs." };
  if (input.kind === "code" && !input.code?.trim()) return { ok: false, error: "Kod krävs för kodbaserade rabatter." };

  const { data: discount, error } = await supabaseService
    .from("discounts")
    .insert({
      title,
      kind: input.kind,
      code: input.kind === "code" ? input.code!.trim().toUpperCase() : null,
      status: "draft",
      combines_with_order: false,
      combines_with_product: false,
      combines_with_shipping: false,
      applies_once_per_customer: false,
    })
    .select("id")
    .single();
  if (error || !discount) return { ok: false, error: error?.message ?? "Kunde inte skapa rabatten." };

  await logAdminAction(admin.adminId, "discounts.create", "discount", discount.id, { title, kind: input.kind });
  return { ok: true, discountId: discount.id };
}
