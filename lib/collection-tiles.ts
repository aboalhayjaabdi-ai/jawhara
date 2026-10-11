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

export async function getCollectionTileGroup(templateSuffix: string | null): Promise<CollectionTile[]> {
  if (!templateSuffix) return [];

  const { data } = await supabase
    .from("collection_tile_items")
    .select("position, collections(title, handle, image_url)")
    .eq("template_suffix", templateSuffix)
    .order("position", { ascending: true });
  if (!data) return [];

  return data
    .map((row) => row.collections as unknown as CollectionTile | null)
    .filter((c): c is CollectionTile => c !== null);
}
