"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string; needsConfirmation?: boolean };

export async function updateCollectionCore(
  collectionId: string,
  input: { title: string; descriptionHtml: string | null; templateSuffix: string | null }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!input.title.trim()) return { ok: false, error: "Titel krävs." };

  const { data: collection } = await supabaseService.from("collections").select("handle").eq("id", collectionId).maybeSingle();
  if (!collection) return { ok: false, error: "Kollektionen hittades inte." };

  const { error } = await supabaseService
    .from("collections")
    .update({
      title: input.title.trim(),
      description_html: input.descriptionHtml || null,
      template_suffix: input.templateSuffix || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", collectionId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.update_core", "collection", collectionId, { title: input.title });
  revalidatePath(`/admin/collections/${collectionId}`);
  revalidatePath(`/collections/${collection.handle}`);
  return { ok: true };
}

export async function updateCollectionSeo(collectionId: string, input: { seoTitle: string | null; seoDescription: string | null }): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data: collection } = await supabaseService.from("collections").select("handle").eq("id", collectionId).maybeSingle();
  if (!collection) return { ok: false, error: "Kollektionen hittades inte." };

  const { error } = await supabaseService
    .from("collections")
    .update({ seo_title: input.seoTitle || null, seo_description: input.seoDescription || null })
    .eq("id", collectionId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.update_seo", "collection", collectionId, {});
  revalidatePath(`/admin/collections/${collectionId}`);
  revalidatePath(`/collections/${collection.handle}`);
  return { ok: true };
}

/** Same needsConfirmation guard as products -- the homepage hardcodes ~9 collection handles
 * directly with no referential-integrity check. */
export async function updateCollectionHandle(collectionId: string, newHandle: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const handle = newHandle.trim().toLowerCase();
  if (!handle) return { ok: false, error: "Handle krävs." };

  const { data: collection } = await supabaseService.from("collections").select("handle, source").eq("id", collectionId).maybeSingle();
  if (!collection) return { ok: false, error: "Kollektionen hittades inte." };
  if (collection.handle === handle) return { ok: true };

  if (collection.source === "shopify" && !confirmed) {
    return { ok: false, error: "Den här kollektionen kan vara länkad från startsidan. Bekräfta för att byta handle ändå.", needsConfirmation: true };
  }

  const { data: existing } = await supabaseService.from("collections").select("id").eq("handle", handle).maybeSingle();
  if (existing) return { ok: false, error: "En annan kollektion använder redan den handlen." };

  const oldHandle = collection.handle;
  const { error } = await supabaseService.from("collections").update({ handle }).eq("id", collectionId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "collections.update_handle", "collection", collectionId, { oldHandle, newHandle: handle });
  revalidatePath(`/admin/collections/${collectionId}`);
  revalidatePath(`/collections/${oldHandle}`);
  revalidatePath(`/collections/${handle}`);
  revalidatePath("/");
  return { ok: true };
}
