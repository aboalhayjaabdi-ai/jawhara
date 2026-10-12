"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireFullAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { checkCollectionDiscountImpact } from "@/lib/admin/discount-guard";
import { getProductDeleteImpact } from "@/lib/admin/product-delete-impact";

export type BulkResult = { ok: true; count: number; skipped: string[] } | { ok: false; error: string };

export async function bulkSetStatus(productIds: string[], status: "active" | "draft" | "archived"): Promise<BulkResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (productIds.length === 0) return { ok: false, error: "Inga produkter valda." };

  const patch: Record<string, unknown> = { status };
  if (status === "active") patch.published_at = new Date().toISOString();
  const { error } = await supabaseService.from("products").update(patch).in("id", productIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.bulk_set_status", undefined, undefined, { productIds, status });
  revalidatePath("/admin/products");
  return { ok: true, count: productIds.length, skipped: [] };
}

export async function bulkAddTags(productIds: string[], tags: string[]): Promise<BulkResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  if (productIds.length === 0 || cleaned.length === 0) return { ok: false, error: "Inga produkter eller taggar valda." };

  const { data: products } = await supabaseService.from("products").select("id, tags").in("id", productIds);
  for (const p of products ?? []) {
    const merged = Array.from(new Set([...(p.tags ?? []), ...cleaned]));
    await supabaseService.from("products").update({ tags: merged }).eq("id", p.id);
  }
  await logAdminAction(admin.adminId, "products.bulk_add_tags", undefined, undefined, { productIds, tags: cleaned });
  revalidatePath("/admin/products");
  return { ok: true, count: products?.length ?? 0, skipped: [] };
}

export async function bulkRemoveTags(productIds: string[], tags: string[]): Promise<BulkResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  const toRemove = new Set(tags.map((t) => t.trim()).filter(Boolean));
  if (productIds.length === 0 || toRemove.size === 0) return { ok: false, error: "Inga produkter eller taggar valda." };

  const { data: products } = await supabaseService.from("products").select("id, tags").in("id", productIds);
  for (const p of products ?? []) {
    const remaining = (p.tags ?? []).filter((t: string) => !toRemove.has(t));
    await supabaseService.from("products").update({ tags: remaining }).eq("id", p.id);
  }
  await logAdminAction(admin.adminId, "products.bulk_remove_tags", undefined, undefined, { productIds, tags: Array.from(toRemove) });
  revalidatePath("/admin/products");
  return { ok: true, count: products?.length ?? 0, skipped: [] };
}

export async function bulkAddToCollection(productIds: string[], collectionId: string): Promise<BulkResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
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

  await logAdminAction(admin.adminId, "products.bulk_add_to_collection", "collection", collectionId, { productIds });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/collections/${collectionId}`);
  return { ok: true, count: toInsert.length, skipped: productIds.filter((id) => existingIds.has(id)) };
}

export async function bulkRemoveFromCollection(productIds: string[], collectionId: string): Promise<BulkResult & { discountWarning?: string[] }> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (productIds.length === 0) return { ok: false, error: "Inga produkter valda." };

  const { data: collection } = await supabaseService.from("collections").select("shopify_id").eq("id", collectionId).maybeSingle();
  const impact = await checkCollectionDiscountImpact(collection?.shopify_id ?? null);

  const { error } = await supabaseService.from("collection_products").delete().eq("collection_id", collectionId).in("product_id", productIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.bulk_remove_from_collection", "collection", collectionId, { productIds, discountImpact: impact });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/collections/${collectionId}`);
  return { ok: true, count: productIds.length, skipped: [], discountWarning: impact.map((d) => d.title) };
}

export async function bulkAdjustPrice(
  productIds: string[],
  input: { mode: "percent" | "amount"; value: number; applyToCompareAt: boolean }
): Promise<BulkResult> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (productIds.length === 0) return { ok: false, error: "Inga produkter valda." };

  const { data: variants } = await supabaseService.from("product_variants").select("id, price, compare_at_price").in("product_id", productIds);
  const skipped: string[] = [];
  for (const v of variants ?? []) {
    const newPrice = input.mode === "percent" ? Number(v.price) * (1 + input.value / 100) : Number(v.price) + input.value;
    if (newPrice < 0) {
      skipped.push(v.id);
      continue;
    }
    const patch: Record<string, number> = { price: Math.round(newPrice * 100) / 100 };
    if (input.applyToCompareAt && v.compare_at_price != null) {
      const newCompareAt = input.mode === "percent" ? Number(v.compare_at_price) * (1 + input.value / 100) : Number(v.compare_at_price) + input.value;
      if (newCompareAt >= 0) patch.compare_at_price = Math.round(newCompareAt * 100) / 100;
    }
    await supabaseService.from("product_variants").update(patch).eq("id", v.id);
  }

  await logAdminAction(admin.adminId, "products.bulk_adjust_price", undefined, undefined, { productIds, ...input });
  revalidatePath("/admin/products");
  return { ok: true, count: (variants?.length ?? 0) - skipped.length, skipped };
}

export async function bulkDelete(productIds: string[], confirmed: boolean): Promise<BulkResult & { impactSummary?: { reviewCount: number; orderItemCount: number } }> {
  const admin = await requireAdmin();
  const denied = requireFullAdmin(admin);
  if (denied) return denied;
  if (productIds.length === 0) return { ok: false, error: "Inga produkter valda." };

  if (!confirmed) {
    const impacts = await Promise.all(productIds.map((id) => getProductDeleteImpact(id)));
    const reviewCount = impacts.reduce((s, i) => s + i.reviewCount, 0);
    const orderItemCount = impacts.reduce((s, i) => s + i.orderItemCount, 0);
    return { ok: false, error: "Bekräfta för att radera permanent.", impactSummary: { reviewCount, orderItemCount } };
  }

  const { error } = await supabaseService.from("products").delete().in("id", productIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "products.bulk_delete", undefined, undefined, { productIds });
  revalidatePath("/admin/products");
  return { ok: true, count: productIds.length, skipped: [] };
}
