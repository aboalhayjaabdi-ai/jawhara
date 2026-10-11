"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

function normalizePath(p: string): string {
  const trimmed = p.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export type CreateRedirectResult =
  | { ok: true; redirect: { id: string; sourcePath: string; destinationPath: string; createdAt: string } }
  | { ok: false; error: string };

export async function createRedirect(sourcePath: string, destinationPath: string): Promise<CreateRedirectResult> {
  const admin = await requireAdmin();

  const source = normalizePath(sourcePath);
  const destination = normalizePath(destinationPath);
  if (source === destination) return { ok: false, error: "Käll- och mållänk kan inte vara samma." };
  if (source.startsWith("/admin") || source.startsWith("/api")) return { ok: false, error: "Kan inte omdirigera adminsidor eller API-rutter." };

  const { data, error } = await supabaseService
    .from("url_redirects")
    .insert({ source_path: source, destination_path: destination, created_by: admin.adminId })
    .select("id, source_path, destination_path, created_at")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "En omdirigering för den länken finns redan." : (error?.message ?? "Kunde inte skapa omdirigeringen.") };

  await logAdminAction(admin.adminId, "redirects.create", "url_redirect", undefined, { source, destination });
  revalidatePath("/admin/settings/redirects");
  return { ok: true, redirect: { id: data.id, sourcePath: data.source_path, destinationPath: data.destination_path, createdAt: data.created_at } };
}

export async function deleteRedirect(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("url_redirects").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "redirects.delete", "url_redirect", id, {});
  revalidatePath("/admin/settings/redirects");
  return { ok: true };
}
