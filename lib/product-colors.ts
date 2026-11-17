// Products that are the exact same model in different colours, stored in the catalog as separate
// products. Each group lists its members (by handle) with the colour name shown to customers; the
// product page shows the group as colour choices that link to each other.
import { cache } from "react";
import { supabase } from "./supabase/client";
import { mediaUrl } from "./supabase/media";

export type ColorGroup = { model: string; members: { handle: string; color: string }[] };

const group = (model: string, members: [handle: string, color: string][]): ColorGroup => ({
  model,
  members: members.map(([handle, color]) => ({ handle, color })),
});

export const COLOR_GROUPS: ColorGroup[] = [
  // Väskor
  group("Millie väska", [["millie-vaska", "Rosa"], ["millie-vaska-1", "Brun"], ["millie-vaska-2", "Krämvit"], ["millie-vaska-3", "Svart"], ["millie-vaska-4", "Grön"], ["millie-vaska-5", "Duvblå"], ["millie-vaska-6", "Orange"], ["millie-vaska-7", "Vinröd"], ["millie-vaska-8", "Gul"]]),
  group("Joélle väska", [["bk-vaska", "Ljusgrön"], ["bk-vaska-1", "Grå"], ["bk-vaska-2", "Svart"], ["bk-vaska-3", "Cognac"], ["bk-vaska-4", "Beige"], ["bk-vaska-5", "Vit"], ["bk-vaska-6", "Taupe"], ["bk-vaska-7", "Ljusblå"], ["bk-vaska-8", "Vinröd"], ["bk-vaska-9", "Rosa"]]),
  group("Lady Väska", [["cc-vaska-4", "Vit"], ["lady-vaska", "Ljusrosa"], ["lady-vaska-1", "Röd"], ["lady-vaska-2", "Svart"]]),
  group("Lilly Väska", [["lilly-vaska", "Krämvit"], ["lilly-vaska-1", "Svart"]]),
  group("Noélle Väska", [["bi-vaska", "Cognac"], ["bi-vaska-1", "Mörkblå"], ["bi-vaska-2", "Chokladbrun"], ["bi-vaska-3", "Krämvit"], ["bi-vaska-4", "Ljusblå"], ["noelle-vaska", "Gråbrun"]]),
  group("Amelie väska", [["amelie-vaska", "Röd"], ["amelie-vaska-1", "Mörkbrun"], ["amelie-vaska-2", "Korallrosa"], ["amelie-vaska-3", "Gul"], ["amelie-vaska-4", "Krämvit"], ["amelie-vaska-5", "Svart"], ["amelie-vaska-6", "Ljusblå"], ["amelie-vaska-7", "Rosa"]]),
  group("H sminkväska", [["h-sminkvaska", "Beige"], ["h-sminkvaska-1", "Turkos"], ["h-sminkvaska-2", "Rosa"], ["h-sminkvaska-3", "Orange"], ["h-sminkvaska-4", "Gul"], ["h-sminkvaska-5", "Marinblå"]]),
  group("H väska liten", [["h-vaska-liten", "Krämvit"], ["h-vaska-liten-1", "Cognac"], ["h-vaska-liten-2", "Taupe"], ["h-vaska-liten-3", "Svart"]]),
  group("Jolie väska", [["jolie-vaska", "Svart"], ["jolie-vaska-1", "Mörkbrun"], ["jolie-vaska-2", "Vit"]]),
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
