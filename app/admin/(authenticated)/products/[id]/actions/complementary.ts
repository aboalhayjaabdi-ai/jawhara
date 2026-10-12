"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addComplementaryProducts(productId: string, complementaryProductIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const ids = complementaryProductIds.filter((id) => id !== productId);
  if (ids.length === 0) return { ok: false, error: "Inga produkter valda." };

  const { data: existing } = await supabaseService.from("product_complementary").select("complementary_product_id").eq("product_id", productId);
  const existingIds = new Set((existing ?? []).map((r) => r.complementary_product_id));
  const { data: maxRow } = await supabaseService
    .from("product_complementary")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPosition = (maxRow?.position ?? -1) + 1;

  const toInsert = ids.filter((id) => !existingIds.has(id)).map((complementary_product_id) => ({ product_id: productId, complementary_product_id, position: nextPosition++ }));
  if (toInsert.length > 0) {
    const { error } = await supabaseService.from("product_complementary").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }

  await logAdminAction(admin.adminId, "products.add_complementary", "product", productId, { complementaryProductIds: toInsert.map((r) => r.complementary_product_id) });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function removeComplementaryProduct(productId: string, complementaryProductId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("product_complementary").delete().eq("product_id", productId).eq("complementary_product_id", complementaryProductId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.remove_complementary", "product", productId, { complementaryProductId });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function reorderComplementaryProducts(productId: string, orderedComplementaryProductIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  for (let i = 0; i < orderedComplementaryProductIds.length; i++) {
    await supabaseService.from("product_complementary").update({ position: i }).eq("product_id", productId).eq("complementary_product_id", orderedComplementaryProductIds[i]);
  }
  await logAdminAction(admin.adminId, "products.reorder_complementary", "product", productId, { count: orderedComplementaryProductIds.length });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}
