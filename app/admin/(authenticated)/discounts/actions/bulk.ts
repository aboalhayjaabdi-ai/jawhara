"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { syncDiscountToShopify, deactivateShopifyDiscount } from "@/lib/shopify/discount-sync";

export type BulkResult = { ok: true; count: number; shopifyWarning?: string } | { ok: false; error: string };

export async function bulkSetDiscountStatus(discountIds: string[], status: "active" | "draft"): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (discountIds.length === 0) return { ok: false, error: "Inga rabatter valda." };

  const { error } = await supabaseService.from("discounts").update({ status }).in("id", discountIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.bulk_set_status", undefined, undefined, { discountIds, status });

  // Best-effort, one at a time -- see updateDiscount's own comment for why this never fails the
  // bulk action above it.
  const results = await Promise.all(discountIds.map((id) => syncDiscountToShopify(id)));
  await logAdminAction(admin.adminId, "discounts.shopify_sync", undefined, undefined, { discountIds, results });
  const failures = results.filter((r) => !r.ok).length;

  revalidatePath("/admin/discounts");
  return {
    ok: true,
    count: discountIds.length,
    shopifyWarning: failures > 0 ? `${failures} av ${discountIds.length} kunde inte synkas till Shopify.` : undefined,
  };
}

export async function bulkDeleteDiscounts(discountIds: string[], confirmed: boolean): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (discountIds.length === 0) return { ok: false, error: "Inga rabatter valda." };
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { data: discounts } = await supabaseService.from("discounts").select("id, kind, shopify_discount_id").in("id", discountIds);
  const { error } = await supabaseService.from("discounts").delete().in("id", discountIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "discounts.bulk_delete", undefined, undefined, { discountIds });

  const toDeactivate = (discounts ?? []).filter((d) => d.shopify_discount_id);
  const results = await Promise.all(toDeactivate.map((d) => deactivateShopifyDiscount(d.kind as "automatic" | "code", d.shopify_discount_id!)));
  const failures = results.filter((r) => !r.ok).length;
  if (toDeactivate.length > 0) await logAdminAction(admin.adminId, "discounts.shopify_sync", undefined, undefined, { discountIds: toDeactivate.map((d) => d.id), results });

  revalidatePath("/admin/discounts");
  return {
    ok: true,
    count: discountIds.length,
    shopifyWarning: failures > 0 ? `${failures} kunde inte avaktiveras i Shopify.` : undefined,
  };
}
