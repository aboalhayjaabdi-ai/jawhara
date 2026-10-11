"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { checkCollectionDiscountImpact, type DiscountImpact } from "@/lib/admin/discount-guard";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type RemoveResult = ActionResult & { discountWarning?: string[] };

export async function addProductsToCollection(collectionId: string, productIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (productIds.length === 0) return { ok: false, error: "Inga produkter valda." };

  const { data: existing } = await supabaseService.from("collection_products").select("product_id").eq("collection_id", collectionId);
  const existingIds = new Set((existing ?? []).map((r) => r.product_id));
  const { data: maxRow } = await supabaseService
    .from("collection_products")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPosition = (maxRow?.position ?? -1) + 1;

  const toInsert = productIds.filter((id) => !existingIds.has(id)).map((product_id) => ({ collection_id: collectionId, product_id, position: nextPosition++ }));
  if (toInsert.length > 0) {
    const { error } = await supabaseService.from("collection_products").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }

  await logAdminAction(admin.adminId, "collections.add_products", "collection", collectionId, { productIds: toInsert.map((r) => r.product_id) });
  revalidatePath(`/admin/collections/${collectionId}`);
  return { ok: true };
}

export async function removeProductFromCollection(collectionId: string, productId: string): Promise<RemoveResult> {
  const admin = await requireAdmin();

  const { data: collection } = await supabaseService.from("collections").select("shopify_id").eq("id", collectionId).maybeSingle();
  const impact = await checkCollectionDiscountImpact(collection?.shopify_id ?? null);

  const { error } = await supabaseService.from("collection_products").delete().eq("collection_id", collectionId).eq("product_id", productId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.remove_product", "collection", collectionId, { productId, discountImpact: impact });
  revalidatePath(`/admin/collections/${collectionId}`);
  return { ok: true, discountWarning: impact.map((d) => d.title) };
}

export async function reorderCollectionProducts(collectionId: string, orderedProductIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  for (let i = 0; i < orderedProductIds.length; i++) {
    await supabaseService.from("collection_products").update({ position: i }).eq("collection_id", collectionId).eq("product_id", orderedProductIds[i]);
  }
  await logAdminAction(admin.adminId, "collections.reorder_products", "collection", collectionId, { count: orderedProductIds.length });
  revalidatePath(`/admin/collections/${collectionId}`);
  return { ok: true };
}
