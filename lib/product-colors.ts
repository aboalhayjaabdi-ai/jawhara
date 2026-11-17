// Products that are the exact same model in the exact same metal, differing only in the colour of
// their enamel, stones or leather, stored in the catalog as separate products. Never mixes models
// (with/without stones, thin/wide) or metals (gold, silver, rose gold). Each group lists its members (by handle) with the colour name shown to customers; the
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
  group("Noélle Väska", [["bi-vaska", "Cognac"], ["bi-vaska-1", "Mörkblå"], ["bi-vaska-2", "Chokladbrun"], ["bi-vaska-3", "Krämvit"], ["bi-vaska-4", "Ljusblå"], ["noelle-vaska", "Gråbrun"], ["noelle-vaska-copy", "Mörk gråbrun"]]),
  group("Amelie väska", [["amelie-vaska", "Röd"], ["amelie-vaska-1", "Mörkbrun"], ["amelie-vaska-2", "Korallrosa"], ["amelie-vaska-3", "Gul"], ["amelie-vaska-4", "Krämvit"], ["amelie-vaska-5", "Svart"], ["amelie-vaska-6", "Ljusblå"], ["amelie-vaska-7", "Rosa"]]),
  group("H sminkväska", [["h-sminkvaska", "Beige"], ["h-sminkvaska-1", "Turkos"], ["h-sminkvaska-2", "Rosa"], ["h-sminkvaska-3", "Orange"], ["h-sminkvaska-4", "Gul"], ["h-sminkvaska-5", "Marinblå"]]),
  group("H väska liten", [["h-vaska-liten", "Krämvit"], ["h-vaska-liten-1", "Cognac"], ["h-vaska-liten-2", "Taupe"], ["h-vaska-liten-3", "Svart"]]),
  group("Jolie väska", [["jolie-vaska", "Svart"], ["jolie-vaska-1", "Mörkbrun"], ["jolie-vaska-2", "Vit"]]),
  group("Colette väska", [["colette-vaska-1", "Med kedja"], ["colette-vaska-2", "Med axelrem"]]),
  group("Kupolväska", [["alma-vaska", "Svart"], ["wilma-vaska", "Beige"], ["mimi-vaska", "Brunt monogram"], ["nora-vaska", "Brunt rutmönster"]]),
  group("Quiltad axelväska", [["cc-vaska-2", "Vit"], ["cc-vaska", "Svart"], ["cc-vaska-3", "Röd"], ["cc-vaska-1", "Beige"]]),
  group("Gift set axelväska", [["coach-gift-set-3", "Brun"], ["coach-gift-set", "Mörkbrun"], ["coach-gift-set-2", "Beige och rosa"]]),
  group("Gift set handväska", [["dior-giftset", "Vinröd"], ["dior-giftset-4", "Röd"], ["dior-giftset-2", "Puderrosa"], ["dior-giftset-5", "Marinblå"], ["dior-giftset-3", "Salviagrön"]]),
  // Armband: guld, silver och roséguld var för sig
  group("H armband guld", [["h-armband-1", "Beige"], ["h-armband-13", "Mörkgrå"], ["h-armband-3", "Ljusblå"], ["h-armband-36", "Vit"], ["h-armband-37", "Röd"], ["h-armband-6", "Ljusrosa"], ["h-armband-7", "Orange"]]),
  group("H armband silver", [["h-armband-11", "Ljusbeige"], ["h-armband-30", "Mörkgrå"], ["h-armband-31", "Lila"], ["h-armband-33", "Mörkbrun"], ["h-armband-34", "Röd"], ["h-armband-35", "Orange"], ["h-armband-9", "Svart"], ["x-link-armband-1", "Vit"]]),
  group("H armband roséguld", [["h-armband-10", "Sandbeige"], ["h-armband-12", "Röd"], ["h-armband-27", "Brun"], ["h-armband-28", "Ljuslila"], ["h-armband-29", "Grafitgrå"], ["h-armband-8", "Ljusgrå"], ["x-link-armband-2", "Svart"]]),
  group("H armband smal guld", [["h-armband-smal", "Svart"], ["h-armband-smal-1", "Limegrön"], ["h-armband-smal-10", "Turkosblå"], ["h-armband-smal-11", "Röd"], ["h-armband-smal-12", "Grå"], ["h-armband-smal-13", "Gammelrosa"], ["h-armband-smal-14", "Mintturkos"], ["h-armband-smal-15", "Koboltblå"], ["h-armband-smal-16", "Orange"], ["h-armband-smal-17", "Vit"], ["h-armband-smal-18", "Lila"], ["h-armband-smal-19", "Marinblå"], ["h-armband-smal-2", "Flaskgrön"], ["h-armband-smal-20", "Beige"], ["h-armband-smal-21", "Lavendellila"], ["h-armband-smal-22", "Ljusrosa"], ["h-armband-smal-23", "Mörkorange"], ["h-armband-smal-24", "Vinröd"], ["h-armband-smal-25", "Mörklila"], ["h-armband-smal-26", "Klarröd"], ["h-armband-smal-27", "Kastanjebrun"], ["h-armband-smal-28", "Turkos"], ["h-armband-smal-3", "Ljusgrå"], ["h-armband-smal-4", "Krämvit"], ["h-armband-smal-5", "Rosa"], ["h-armband-smal-6", "Ljusblå"], ["h-armband-smal-7", "Senapsgul"], ["h-armband-smal-8", "Chokladbrun"], ["h-armband-smal-9", "Orangeröd"]]),
  group("H armband smal silver", [["h-armband-smal-29", "Rostbrun"], ["h-armband-smal-30", "Marinblå"], ["h-armband-smal-31", "Lila"], ["h-armband-smal-32", "Mörklila"], ["h-armband-smal-33", "Grå"], ["h-armband-smal-34", "Beige"], ["h-armband-smal-35", "Klarröd"], ["h-armband-smal-36", "Vinröd"], ["h-armband-smal-37", "Vit"], ["h-armband-smal-38", "Senapsgul"], ["h-armband-smal-39", "Mörkbrun"], ["h-armband-smal-40", "Koboltblå"], ["h-armband-smal-41", "Röd"], ["h-armband-smal-42", "Ljusrosa"], ["h-armband-smal-43", "Orange"], ["h-armband-smal-44", "Tegelröd"], ["h-armband-smal-45", "Lavendellila"], ["h-armband-smal-46", "Petrolblå"], ["h-armband-smal-47", "Mintgrön"]]),
  group("Klöver armband guld", [["klover-armband", "Guld"], ["klover-armband-10", "Tigeröga"], ["klover-armband-14", "Lila"], ["klover-armband-16", "Rosa pärlemor"], ["klover-armband-17", "Blågrå"], ["klover-armband-18", "Turkos"], ["klover-armband-3", "Vit pärlemor"], ["klover-armband-4", "Svart"], ["klover-armband-5", "Grön"], ["klover-armband-6", "Blå"], ["klover-armband-7", "Röd"]]),
  group("Klöver armband silver", [["klover-armband-1", "Silver"], ["klover-armband-11", "Ljusblå"], ["klover-armband-12", "Ljusrosa"]]),
  group("Klöver armband tvåfärgat", [["klover-armband-15", "Rosa och guld"], ["klover-armband-9", "Guld och stenar"], ["klover-armband-copy-1", "Röd och guld"]]),
  group("Blom armband", [["blom-armband", "Krämvit"], ["blom-armband-1", "Mintgrön"], ["blom-armband-2", "Blå blommor"], ["blom-armband-3", "Beige"], ["blom-armband-4", "Rosa"], ["blom-armband-5", "Gul och orange"]]),
  group("Riri armband", [["riri-armband", "Klara stenar"], ["riri-armband-1", "Rosa och lila"], ["riri-armband-3", "Flerfärgad"], ["riri-armband-4", "Blå och grön"], ["riri-armband-5", "Rosa"]]),
  group("Klöver diamant armband", [["klover-diamant-armband", "Svart och klar"], ["klover-diamant-armband-1", "Blå"], ["klover-diamant-armband-2", "Flerfärgad"], ["klover-diamant-armband-3", "Klar"]]),
  group("Klöver diamant armband tunt", [["klover-diamant-armband-4", "Grön"], ["klover-diamant-armband-5", "Rosa"]]),
  group("Klöver smyckesset guld", [["klover-armband-8", "Ljusblå"], ["klover-smyckesset-2", "Vit"], ["klover-smyckesset-4", "Cerise"], ["klover-smyckesset-5", "Ljusrosa"], ["klover-smyckesset-6", "Mintgrön"]]),
  group("Klöver smyckesset silver", [["klover-smyckesset", "Rosa"], ["klover-smyckesset-1", "Ljuslila"], ["klover-smyckesset-3", "Blågrön"]]),
  group("Klöver halsband hänge guld", [["klover-halsband", "Svart"], ["klover-halsband-1", "Grön"], ["klover-halsband-2", "Vinröd"], ["klover-halsband-6", "Guld"], ["klover-halsband-copy", "Vit pärlemor"]]),
  group("Klöver halsband kedja guld", [["klover-halsband-10", "Guld"], ["klover-halsband-13", "Grön"], ["klover-halsband-14", "Röd"], ["klover-halsband-15", "Blå"]]),
  group("Klöver ring med sten", [["klover-ring", "Svart"], ["klover-ring-1", "Röd"], ["klover-ring-2", "Vit"], ["klover-ring-5", "Tigeröga"], ["klover-ring-8", "Grön"]]),
  group("Klöver ring", [["klover-ring-11", "Röd"], ["klover-ring-4", "Grön"], ["klover-ring-6", "Vit pärlemor"], ["klover-ring-7", "Svart"], ["klover-ring-9", "Guld"]]),
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
