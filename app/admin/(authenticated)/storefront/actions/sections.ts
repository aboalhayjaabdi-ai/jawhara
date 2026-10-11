"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import {
  reorderSections,
  setSectionVisible,
  updateSectionConfig,
  addSection,
  deleteSection,
  publishHomeLayout,
  discardDraft,
  type SectionType,
  type Section,
} from "@/lib/admin/storefront-layout";

export type ActionResult = { ok: true } | { ok: false; error: string };

const PAGE = "home";

export async function reorderSectionsAction(orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await reorderSections(PAGE, orderedIds, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.reorder_sections", "storefront_layout", PAGE, { orderedIds });
  revalidatePath("/admin/storefront");
  return { ok: true };
}

export async function setSectionVisibleAction(sectionId: string, visible: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await setSectionVisible(PAGE, sectionId, visible, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.set_section_visible", "storefront_layout", PAGE, { sectionId, visible });
  revalidatePath("/admin/storefront");
  return { ok: true };
}

export async function updateSectionConfigAction(sectionId: string, config: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await updateSectionConfig(PAGE, sectionId, config, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.update_section", "storefront_layout", PAGE, { sectionId });
  revalidatePath("/admin/storefront");
  return { ok: true };
}

export async function addSectionAction(type: SectionType, afterSectionId: string | null): Promise<{ ok: true; section: Section } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const result = await addSection(PAGE, type, afterSectionId, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.add_section", "storefront_layout", PAGE, { type, sectionId: result.section.id });
  revalidatePath("/admin/storefront");
  return result;
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await deleteSection(PAGE, sectionId, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.delete_section", "storefront_layout", PAGE, { sectionId });
  revalidatePath("/admin/storefront");
  return { ok: true };
}

export async function publishHomeLayoutAction(note: string | null): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const result = await publishHomeLayout(PAGE, note, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.publish", "storefront_layout", PAGE, { version: result.version, note });
  revalidatePath("/admin/storefront");
  revalidatePath("/"); // the one action that affects the live homepage -- reflect it immediately, not after up to 60s of ISR.
  return result;
}

export async function discardDraftAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await discardDraft(PAGE, admin.adminId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.discard_draft", "storefront_layout", PAGE, {});
  revalidatePath("/admin/storefront");
  return { ok: true };
}
