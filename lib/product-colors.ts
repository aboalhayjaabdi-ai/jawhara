// Products that are the exact same model in different colours, stored in the catalog as separate
// products. Each group lists its members (by handle) with the colour name shown to customers; the
// product page shows the group as colour choices that link to each other.
import { cache } from "react";
import { supabase } from "./supabase/client";
import { mediaUrl } from "./supabase/media";

export type ColorGroup = { model: string; members: { handle: string; color: string }[] };

export const COLOR_GROUPS: ColorGroup[] = [
  {
    model: "Millie väska",
    members: [
      { handle: "millie-vaska", color: "Rosa" },
      { handle: "millie-vaska-1", color: "Brun" },
      { handle: "millie-vaska-2", color: "Krämvit" },
      { handle: "millie-vaska-3", color: "Svart" },
      { handle: "millie-vaska-4", color: "Grön" },
      { handle: "millie-vaska-5", color: "Duvblå" },
      { handle: "millie-vaska-6", color: "Orange" },
      { handle: "millie-vaska-7", color: "Vinröd" },
      { handle: "millie-vaska-8", color: "Gul" },
    ],
  },
];

const groupByHandle = new Map(COLOR_GROUPS.flatMap((g) => g.members.map((m) => [m.handle, g] as const)));

export type ColorOption = { handle: string; color: string; image: string | null; current: boolean };

/** The colour choices for a product page: every active member of its group, in the group's order,
 * with its first photo. Null when the product isn't in a group (or is the only active member). */
export const getColorOptions = cache(async (handle: string): Promise<ColorOption[] | null> => {
  const group = groupByHandle.get(handle);
  if (!group) return null;
  const { data } = await supabase
    .from("products")
    .select("handle, media(storage_path, position)")
    .in("handle", group.members.map((m) => m.handle))
    .eq("status", "active");
  const byHandle = new Map(((data ?? []) as any[]).map((p) => [p.handle as string, p]));
  const options = group.members.flatMap((m) => {
    const p = byHandle.get(m.handle);
    if (!p) return [];
    const first = [...(p.media ?? [])].sort((a: any, b: any) => a.position - b.position)[0];
    return [{ handle: m.handle, color: m.color, image: first ? mediaUrl(first.storage_path) : null, current: m.handle === handle }];
  });
  return options.length > 1 ? options : null;
});
