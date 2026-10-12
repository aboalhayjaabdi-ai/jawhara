"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateHtmlPage(id: string, handle: string, title: string, bodyHtml: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!title.trim()) return { ok: false, error: "Titel krävs." };

  const { error } = await supabaseService
    .from("content_pages")
    .update({ title, body_html: bodyHtml, updated_at: new Date().toISOString(), updated_by: admin.adminId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "content_pages.update", "content_page", id, { handle });
  revalidatePath("/admin/content");
  revalidatePath(`/pages/${handle}`);
  return { ok: true };
}

export async function updateFaqPage(id: string, handle: string, title: string, items: { q: string; a: string }[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!title.trim()) return { ok: false, error: "Titel krävs." };
  const cleaned = items.filter((i) => i.q.trim() && i.a.trim());
  if (cleaned.length === 0) return { ok: false, error: "Minst en fråga och ett svar krävs." };

  const { error } = await supabaseService
    .from("content_pages")
    .update({ title, faq_items: cleaned, updated_at: new Date().toISOString(), updated_by: admin.adminId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "content_pages.update", "content_page", id, { handle });
  revalidatePath("/admin/content");
  revalidatePath(`/pages/${handle}`);
  return { ok: true };
}

export async function updateContactPage(id: string, handle: string, title: string, intro: string, emailNote: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!title.trim()) return { ok: false, error: "Titel krävs." };

  const { error } = await supabaseService
    .from("content_pages")
    .update({ title, contact_intro: intro, contact_email_note: emailNote, updated_at: new Date().toISOString(), updated_by: admin.adminId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "content_pages.update", "content_page", id, { handle });
  revalidatePath("/admin/content");
  revalidatePath(`/pages/${handle}`);
  return { ok: true };
}
