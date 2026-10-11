"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { checkCollectionDiscountImpact, type DiscountImpact } from "@/lib/admin/discount-guard";

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function getCollectionDeleteImpact(collectionId: string): Promise<{ productCount: number; discountImpact: DiscountImpact }> {
  const { data: collection } = await supabaseService.from("collections").select("shopify_id").eq("id", collectionId).maybeSingle();
  const [{ count: productCount }, discountImpact] = await Promise.all([
    supabaseService.from("collection_products").select("product_id", { count: "exact", head: true }).eq("collection_id", collectionId),
    checkCollectionDiscountImpact(collection?.shopify_id ?? null),
  ]);
  return { productCount: productCount ?? 0, discountImpact };
}

/** Deleting cascades collection_products only (collections.id → on delete cascade) -- never the
 * member products themselves. */
export async function deleteCollection(collectionId: string, confirmed: boolean): Promise<DeleteResult> {
  const admin = await requireAdmin();
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera permanent." };

  const { data: collection } = await supabaseService.from("collections").select("handle, title").eq("id", collectionId).maybeSingle();
  if (!collection) return { ok: false, error: "Kollektionen hittades inte." };

  const { error } = await supabaseService.from("collections").delete().eq("id", collectionId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.delete", "collection", collectionId, { title: collection.title });
  revalidatePath("/admin/collections");
  revalidatePath(`/collections/${collection.handle}`);
  return { ok: true };
}
