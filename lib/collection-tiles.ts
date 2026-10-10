// Real collection subcategory-tile navigation, keyed by Shopify's own templateSuffix
// (collections.template_suffix, backfilled from a live re-pull --
// see scripts/shopify/backfill-template-suffix.ts). Only 6 real template files in the theme
// export ever had a genuinely configured collection-list section (confirmed by reading every
// collection.*.json's real sections, not by filename similarity) -- every other collection
// (vaskor, tillbehor, and all default-template utility collections never linked from any menu)
// never had this feature, so no tiles render there. Tile lists below are each template's real,
// exact `collection_list` setting, in real order.
export const COLLECTION_TILE_GROUPS: Record<string, string[]> = {
  armband: ["armband-copy", "h-armband", "h-armband-smal", "klover-armband-1", "guld-armband-1", "silver-armband-2"],
  halsband: ["halsband-copy", "guld-halsband", "silver-halsband"],
  ringar: ["ringar-copy", "guld-ringar-1", "guld-ringar"],
  orhangen: ["orhangen-copy", "guld-orhangen", "silver-orhangen"],
  "alla-smycken": ["alla-smycken", "armband", "halsband", "ringar", "orhangen"],
  "klover-armband": ["armband-copy", "guld-armband-1", "rose-guld-armband-2", "silver-armband-2"],
};

// 8 real tile handles whose own collection.image is genuinely null in Shopify. The real theme's
// snippets/resource-image.liquid falls back to `collection.products.first.featured_image` in this
// exact case (not a placeholder) -- confirmed by reading that snippet's real fallback chain and
// verified live against Shopify (sortKey: COLLECTION_DEFAULT, matching each collection's own real
// sort order) for every one of these 8. Each image already exists in Supabase (the real product's
// own already-migrated photo) -- nothing invented, nothing substituted from an unrelated product.
export const COLLECTION_TILE_FALLBACK_IMAGE: Record<string, string> = {
  "guld-armband-1": "10281970434386/64252839330130.png", // Knot armband
  "silver-armband-2": "9792036569426/64031284363602.png", // H armband
  "rose-guld-armband-2": "9792055083346/64031245631826.png", // Luma armband
  "guld-orhangen": "10269529604434/64067514696018.png", // LV Örhänge
  "silver-orhangen": "10879553765714/71358665883986.png", // Vesta örhänge
  "guld-ringar-1": "10788395221330/70698571956562.png", // Love ring
  "guld-ringar": "10864635281746/64034880979282.png", // Aurora ring (this tile's real Shopify title is "Silver ringar")
  "alla-smycken": "10865158979922/71233026031954.png", // H armband (h-armband-1)
};
