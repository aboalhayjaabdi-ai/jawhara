"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { reorderMenuItems, addMenuItem, updateMenuItem, deleteMenuItem } from "@/lib/admin/storefront-menus";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Menus have no draft/publish stage of their own (unlike the homepage layout) -- a saved change
// to a nav link is live the moment it's saved, since the user's ask frames versioning around the
// homepage section layout specifically, not nav links. Each write still revalidates every page
// (menus render in the root (storefront) layout, present on every route) so it's reflected
// immediately rather than waiting out any cache window.
export async function reorderMenuItemsAction(menuId: string, orderedIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await reorderMenuItems(menuId, orderedIds);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.reorder_menu_items", "storefront_menu", menuId, { orderedIds });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addMenuItemAction(menuId: string, title: string, href: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await addMenuItem(menuId, title, href);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.add_menu_item", "storefront_menu", menuId, { title, href });
  revalidatePath("/", "layout");
  revalidatePath("/admin/storefront/menus");
  return { ok: true };
}

export async function updateMenuItemAction(itemId: string, title: string, href: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await updateMenuItem(itemId, title, href);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.update_menu_item", "storefront_menu_item", itemId, { title, href });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMenuItemAction(itemId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = await deleteMenuItem(itemId);
  if (!result.ok) return result;
  await logAdminAction(admin.adminId, "storefront.delete_menu_item", "storefront_menu_item", itemId, {});
  revalidatePath("/", "layout");
  revalidatePath("/admin/storefront/menus");
  return { ok: true };
}
