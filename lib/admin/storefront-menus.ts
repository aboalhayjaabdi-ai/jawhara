import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/storefront-menus.ts must never be imported into client code");
}

export type MenuHandle = "main-menu" | "footer" | "about" | "terms" | "social";
export type MenuItem = { id: string; title: string; href: string; position: number };
export type Menu = { id: string; handle: MenuHandle; label: string; items: MenuItem[] };

export async function listMenusWithItems(): Promise<Menu[]> {
  const { data } = await supabaseService
    .from("storefront_menus")
    .select("id, handle, label, storefront_menu_items(id, title, href, position)")
    .order("handle");
  return (data ?? []).map((m: any) => ({
    id: m.id,
    handle: m.handle,
    label: m.label,
    items: (m.storefront_menu_items ?? []).sort((a: MenuItem, b: MenuItem) => a.position - b.position),
  }));
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function reorderMenuItems(menuId: string, orderedIds: string[]): Promise<SaveResult> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseService.from("storefront_menu_items").update({ position: i }).eq("id", orderedIds[i]).eq("menu_id", menuId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function addMenuItem(menuId: string, title: string, href: string): Promise<SaveResult> {
  if (!title.trim() || !href.trim()) return { ok: false, error: "Titel och länk krävs." };
  const { count } = await supabaseService.from("storefront_menu_items").select("id", { count: "exact", head: true }).eq("menu_id", menuId);
  const { error } = await supabaseService.from("storefront_menu_items").insert({ menu_id: menuId, title: title.trim(), href: href.trim(), position: count ?? 0 });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateMenuItem(itemId: string, title: string, href: string): Promise<SaveResult> {
  if (!title.trim() || !href.trim()) return { ok: false, error: "Titel och länk krävs." };
  const { error } = await supabaseService.from("storefront_menu_items").update({ title: title.trim(), href: href.trim() }).eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteMenuItem(itemId: string): Promise<SaveResult> {
  const { error } = await supabaseService.from("storefront_menu_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
