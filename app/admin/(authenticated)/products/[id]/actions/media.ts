"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function reorderMedia(productId: string, orderedMediaIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  for (let i = 0; i < orderedMediaIds.length; i++) {
    await supabaseService.from("media").update({ position: i }).eq("id", orderedMediaIds[i]).eq("product_id", productId);
  }
  await logAdminAction(admin.adminId, "products.reorder_media", "product", productId, { count: orderedMediaIds.length });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function setAltText(productId: string, mediaId: string, altText: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("media").update({ alt_text: altText || null }).eq("id", mediaId).eq("product_id", productId);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "products.set_media_alt", "product", productId, { mediaId });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/** One image per variant at a time, matching real Shopify variant.image semantics -- clears any
 * other media row's prior claim on this variant before assigning the new one. */
export async function assignVariantImage(productId: string, mediaId: string, variantId: string | null): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (variantId) {
    await supabaseService.from("media").update({ variant_id: null }).eq("product_id", productId).eq("variant_id", variantId);
  }
  const { error } = await supabaseService.from("media").update({ variant_id: variantId }).eq("id", mediaId).eq("product_id", productId);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "products.assign_variant_image", "product", productId, { mediaId, variantId });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/** Removes the media row only, not the underlying storage object -- storage_path can be shared
 * across products (migration 0002's unique(shopify_id, product_id) constraint reflects exactly
 * this). Stale-object cleanup is a deliberate, low-risk scope-cut. */
export async function deleteMedia(productId: string, mediaId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("media").delete().eq("id", mediaId).eq("product_id", productId);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "products.delete_media", "product", productId, { mediaId });
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}
