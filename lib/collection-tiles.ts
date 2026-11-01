// Real collection subcategory-tile navigation, keyed by Shopify's own templateSuffix
// (collections.template_suffix, backfilled from a live re-pull --
// see scripts/shopify/backfill-template-suffix.ts). Originally a hardcoded static Record
// (COLLECTION_TILE_GROUPS) with a separate COLLECTION_TILE_FALLBACK_IMAGE map for the 8 tiles
// whose own collection.image was genuinely null in Shopify; migrated to the DB-backed
// collection_tile_items table (Phase 3, scripts/supabase/backfill-product-templates.ts resolved
// every handle to its real collection and backfilled collections.image_url for all 8 fallback
// cases) so admins can manage tile groups without a code deploy. The fallback-image map is gone
// entirely -- those 8 collections now carry a real image_url, and the caller
// (components/collection/subcategory-tiles.tsx) already renders nothing when image_url is null.
import { supabase } from "./supabase/client";

export type CollectionTile = {
  title: string;
  handle: string;
  image_url: string | null;
};

/** The one "back to the full category" tile per template group (e.g. "Alla väskor" on any bag
 * sub-collection, linking back to the real main collection -- never a separate collection with
 * duplicated products). Shown on every sub-collection page in the group, hidden on the group's own
 * main collection page since the customer is already there. A static map rather than another
 * admin-editable collection_tile_items row: there is exactly one of these per group, it never
 * varies independently of the group's own main collection, and it needs a display label ("Alla
 * väskor") that differs from that collection's own title ("Väskor") -- not worth a schema column
 * for a single fixed label per group. */
const BACK_TO_MAIN: Record<string, { handle: string; label: string }> = {
  vaskor: { handle: "vaskor-och-tillbehor", label: "Alla väskor" },
  armband: { handle: "armband", label: "Alla armband" },
  // Klöver armband is its own collection/template (a bracelet style, not one of the bracelet
  // metal-variant tiles), but its tile row has always pointed back to the general bracelets
  // collection the same way -- same target and label as the "armband" group above.
  "klover-armband": { handle: "armband", label: "Alla armband" },
  halsband: { handle: "halsband", label: "Alla Halsband" },
  ringar: { handle: "ringar", label: "Alla Ringar" },
  orhangen: { handle: "orhangen", label: "Alla Örhängen" },
};

/** `currentHandle` is the collection actually being viewed -- used to (1) drop the "back to main"
 * tile when that *is* the main collection, and (2) never show a tile linking to the page the
 * customer is already on, for any tile in the group. */
export async function getCollectionTileGroup(templateSuffix: string | null, currentHandle: string): Promise<CollectionTile[]> {
  if (!templateSuffix) return [];

  const back = BACK_TO_MAIN[templateSuffix];

  const { data } = await supabase
    .from("collection_tile_items")
    .select("position, collections(title, handle, image_url)")
    .eq("template_suffix", templateSuffix)
    .order("position", { ascending: true });

  const tiles = (data ?? [])
    .map((row) => row.collections as unknown as CollectionTile | null)
    .filter((c): c is CollectionTile => c !== null)
    .filter((c) => c.handle !== currentHandle);

  if (back && back.handle !== currentHandle) {
    const { data: rootCollection } = await supabase.from("collections").select("image_url").eq("handle", back.handle).maybeSingle();
    tiles.unshift({ title: back.label, handle: back.handle, image_url: rootCollection?.image_url ?? null });
  }

  return tiles;
}
