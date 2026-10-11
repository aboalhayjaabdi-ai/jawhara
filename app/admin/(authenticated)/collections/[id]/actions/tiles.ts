"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addTileItem(templateSuffix: string, childCollectionId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data: maxRow } = await supabaseService
    .from("collection_tile_items")
    .select("position")
    .eq("template_suffix", templateSuffix)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { error } = await supabaseService.from("collection_tile_items").upsert(
    { template_suffix: templateSuffix, child_collection_id: childCollectionId, position },
    { onConflict: "template_suffix,child_collection_id" }
  );
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.add_tile_item", undefined, undefined, { templateSuffix, childCollectionId });
  revalidatePath("/admin/collections");
  return { ok: true };
}

export async function removeTileItem(tileItemId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("collection_tile_items").delete().eq("id", tileItemId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.remove_tile_item", undefined, undefined, { tileItemId });
  revalidatePath("/admin/collections");
  return { ok: true };
}

export async function reorderTileItems(templateSuffix: string, orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    await supabaseService.from("collection_tile_items").update({ position: i }).eq("id", orderedIds[i]).eq("template_suffix", templateSuffix);
  }
  await logAdminAction(admin.adminId, "collections.reorder_tile_items", undefined, undefined, { templateSuffix, count: orderedIds.length });
  revalidatePath("/admin/collections");
  return { ok: true };
}
