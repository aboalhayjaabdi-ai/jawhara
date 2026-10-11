"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { adjustInventory, type InventoryAdjustmentReason } from "@/lib/admin/inventory-ledger";

export type AdjustResult = { ok: true; newQuantity: number } | { ok: false; error: string };

export async function adjustVariantInventory(
  productId: string,
  variantId: string,
  input: { mode: "set" | "delta"; value: number; reason: InventoryAdjustmentReason; note?: string }
): Promise<AdjustResult> {
  const admin = await requireAdmin();

  const result = await adjustInventory({ variantId, ...input }, admin.adminId);
  if (!result.ok) return result;

  await logAdminAction(admin.adminId, "products.adjust_inventory", "product_variant", variantId, {
    productId,
    mode: input.mode,
    value: input.value,
    reason: input.reason,
    newQuantity: result.newQuantity,
  });

  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  revalidatePath(`/admin/products/${productId}`);
  if (product) revalidatePath(`/products/${product.handle}`);

  return result;
}
