"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type DiscountFormInput = {
  title: string;
  kind: "automatic" | "code";
  code: string | null;
  status: "draft" | "scheduled" | "active" | "expired";
  shape: "order_percentage" | "bxgy";
  getPercentage: number | null;
  buyQuantity: number | null;
  buyItemType: "all" | "product" | "collection" | null;
  buyItemIds: string[] | null;
  getQuantity: number | null;
  getItemType: "all" | "product" | "collection" | null;
  getItemIds: string[] | null;
  combinesWithOrder: boolean;
  combinesWithProduct: boolean;
  combinesWithShipping: boolean;
  usesPerOrderLimit: number | null;
  usageLimit: number | null;
  appliesOncePerCustomer: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export async function updateDiscount(discountId: string, input: DiscountFormInput): Promise<ActionResult> {
  const admin = await requireAdmin();

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titel krävs." };
  if (input.kind === "code" && !input.code?.trim()) return { ok: false, error: "Kod krävs för kodbaserade rabatter." };
  if (input.shape === "bxgy" && (input.buyQuantity == null || input.getQuantity == null || !input.buyItemType || !input.getItemType)) {
    return { ok: false, error: "Köp X få Y kräver antal och regler för både köp- och få-sidan." };
  }
  if (input.getPercentage != null && (input.getPercentage < 1 || input.getPercentage > 100)) {
    return { ok: false, error: "Procent måste vara mellan 1 och 100." };
  }

  const isBxgy = input.shape === "bxgy";
  const { error } = await supabaseService
    .from("discounts")
    .update({
      title,
      kind: input.kind,
      code: input.kind === "code" ? input.code!.trim().toUpperCase() : null,
      status: input.status,
      get_percentage: input.getPercentage,
      buy_quantity: isBxgy ? input.buyQuantity : null,
      buy_item_type: isBxgy ? input.buyItemType : null,
      buy_item_ids: isBxgy && input.buyItemType !== "all" ? input.buyItemIds : null,
      get_quantity: isBxgy ? input.getQuantity : null,
      get_item_type: isBxgy ? input.getItemType : null,
      get_item_ids: isBxgy && input.getItemType !== "all" ? input.getItemIds : null,
      combines_with_order: input.combinesWithOrder,
      combines_with_product: input.combinesWithProduct,
      combines_with_shipping: input.combinesWithShipping,
      uses_per_order_limit: isBxgy ? input.usesPerOrderLimit : null,
      usage_limit: input.usageLimit,
      applies_once_per_customer: input.appliesOncePerCustomer,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    .eq("id", discountId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.update", "discount", discountId, { title, kind: input.kind, shape: input.shape, status: input.status });
  revalidatePath("/admin/discounts");
  revalidatePath(`/admin/discounts/${discountId}`);
  return { ok: true };
}

export async function deleteDiscount(discountId: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { data: discount } = await supabaseService.from("discounts").select("title").eq("id", discountId).maybeSingle();
  const { error } = await supabaseService.from("discounts").delete().eq("id", discountId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.delete", "discount", discountId, { title: discount?.title });
  revalidatePath("/admin/discounts");
  return { ok: true };
}
