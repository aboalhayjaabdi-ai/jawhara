// One-time Phase 3 data backfill: migrates lib/product-templates.ts's hardcoded PRODUCT_TEMPLATES
// map and lib/collection-tiles.ts's hardcoded COLLECTION_TILE_GROUPS/COLLECTION_TILE_FALLBACK_IMAGE
// maps into the new product_templates/collection_tile_items tables (migration 0013). Imports the
// real TS objects directly rather than hand-transcribing them into SQL literals -- this guarantees
// byte-for-byte fidelity (including the confirmed-stale erbjudande-vaskor intro paragraph and every
// casing inconsistency) with zero manual-transcription risk, a stronger "never silently fix"
// guarantee than hand-authored SQL would give.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

import { createClient } from "@supabase/supabase-js";
import { PRODUCT_TEMPLATES } from "../../lib/product-templates";
import { COLLECTION_TILE_GROUPS, COLLECTION_TILE_FALLBACK_IMAGE } from "../../lib/collection-tiles";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function mediaUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${storagePath}`;
}

const TEMPLATE_NAMES: Record<string, string> = {
  armband: "Armband",
  halsband: "Halsband",
  orhangen: "Örhängen",
  ringar: "Ringar",
  vaskor: "Väskor",
  "erbjudande-vaskor": "Erbjudande (väskor)",
  planbok: "Plånbok",
  skal: "Skal",
};

// --- Pass 1: product_templates, verbatim from PRODUCT_TEMPLATES ---
const templateRows = Object.entries(PRODUCT_TEMPLATES).map(([key, content]) => ({
  key,
  name: TEMPLATE_NAMES[key] ?? key,
  intro_paragraph: content.introParagraph,
  trust_lines: content.trustLines,
  usp_block: content.uspBlock,
  faq: content.faq,
  description_heading: content.descriptionHeading,
  accordion_rows: content.accordionRows,
  size_guide_href: content.sizeGuideHref,
  offer_message: content.offerMessage,
  show_inventory_status: content.showInventoryStatus,
  gallery_layout: content.galleryLayout,
}));
const { error: templatesError } = await supabase.from("product_templates").upsert(templateRows, { onConflict: "key" });
if (templatesError) throw templatesError;
console.log(`✓ product_templates: ${templateRows.length} rows upserted`);

// --- Pass 2: collection_tile_items, resolving each handle to its real collections.id ---
const { data: collections, error: collectionsError } = await supabase.from("collections").select("id, handle, image_url");
if (collectionsError) throw collectionsError;
const collectionIdByHandle = new Map((collections ?? []).map((c) => [c.handle, c.id]));

const tileRows: { template_suffix: string; child_collection_id: string; position: number }[] = [];
const missingHandles: string[] = [];
for (const [templateSuffix, handles] of Object.entries(COLLECTION_TILE_GROUPS)) {
  handles.forEach((handle, position) => {
    const id = collectionIdByHandle.get(handle);
    if (!id) {
      missingHandles.push(`${templateSuffix}:${handle}`);
      return;
    }
    tileRows.push({ template_suffix: templateSuffix, child_collection_id: id, position });
  });
}
if (missingHandles.length) console.warn("⚠ collection handles not found, skipped:", missingHandles);
const { error: tilesError } = await supabase.from("collection_tile_items").upsert(tileRows, { onConflict: "template_suffix,child_collection_id" });
if (tilesError) throw tilesError;
console.log(`✓ collection_tile_items: ${tileRows.length} rows upserted`);

// --- Pass 3: backfill collections.image_url from COLLECTION_TILE_FALLBACK_IMAGE, only where
// the collection doesn't already have a real image_url (never overwrite a real value). ---
let imageBackfillCount = 0;
for (const [handle, storagePath] of Object.entries(COLLECTION_TILE_FALLBACK_IMAGE)) {
  const existing = (collections ?? []).find((c) => c.handle === handle);
  if (!existing) {
    console.warn(`⚠ collection handle not found for image backfill: ${handle}`);
    continue;
  }
  if (existing.image_url) continue; // already has a real image, don't overwrite
  const { error } = await supabase.from("collections").update({ image_url: mediaUrl(storagePath) }).eq("id", existing.id);
  if (error) throw error;
  imageBackfillCount += 1;
}
console.log(`✓ collections.image_url backfilled: ${imageBackfillCount} rows`);

console.log("\n✓ Phase 3 catalog data backfill complete.");
