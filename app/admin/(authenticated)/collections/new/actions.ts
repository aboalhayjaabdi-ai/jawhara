"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type CreateCollectionResult = { ok: true; collectionId: string } | { ok: false; error: string };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createCollection(input: { title: string; handle?: string; templateSuffix?: string | null }): Promise<CreateCollectionResult> {
  const admin = await requireAdmin();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Titel krävs." };

  const baseHandle = (input.handle?.trim() || slugify(title)) || `kollektion-${Date.now()}`;
  let handle = baseHandle;
  let attempt = 0;
  for (;;) {
    const { data: existing } = await supabaseService.from("collections").select("id").eq("handle", handle).maybeSingle();
    if (!existing) break;
    attempt += 1;
    handle = `${baseHandle}-${attempt + 1}`;
  }

  const { data: collection, error } = await supabaseService
    .from("collections")
    .insert({ title, handle, source: "manual", template_suffix: input.templateSuffix || null })
    .select("id")
    .single();
  if (error || !collection) return { ok: false, error: error?.message ?? "Kunde inte skapa kollektionen." };

  await logAdminAction(admin.adminId, "collections.create", "collection", collection.id, { title, handle });
  return { ok: true, collectionId: collection.id };
}
