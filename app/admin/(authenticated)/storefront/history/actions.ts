"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { restoreVersionToDraft } from "@/lib/admin/storefront-layout";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function restoreVersionAction(version: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await restoreVersionToDraft("home", version, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.restore_version_to_draft", "storefront_layout", "home", { version });
  return { ok: true };
}
