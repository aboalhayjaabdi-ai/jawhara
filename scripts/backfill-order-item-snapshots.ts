// One-time backfill: freezes image_url/image_is_variant_specific/variant_title_snapshot on every
// existing order_items row that doesn't have one yet (migration 0041 added the columns empty).
// Going forward, lib/shopify/order-sync-shared.ts's upsertShopifyOrder sets these at the moment
// each order item is first synced -- this script only catches the historical backlog. Uses the
// exact same resolution (lib/order-images.ts) every transactional email and the admin order page
// already use, so a backfilled row is indistinguishable from one snapshotted at sync time.
import { config } from "dotenv";
config({ path: ".env.local" });
import { ProxyAgent, setGlobalDispatcher } from "undici";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

import { supabaseService } from "@/lib/supabase/service-client";
import { getOrderItemImages } from "@/lib/order-images";

const BATCH_SIZE = 500;

async function main() {
  let totalUpdated = 0;
  for (;;) {
    // Gated on image_is_variant_specific (not image_url): after processing, image_url can
    // legitimately end up null (no image was ever available) -- that's a valid, FINAL snapshot
    // state, not "still needs backfill". image_is_variant_specific is always set to a real
    // boolean once processed (see the update below), so only its NULL-ness means "never touched
    // by this script or upsertShopifyOrder yet".
    const { data: batch, error } = await supabaseService
      .from("order_items")
      .select("id, variant_id, product_id")
      .is("image_is_variant_specific", null)
      .limit(BATCH_SIZE);
    if (error) throw new Error(error.message);
    if (!batch || batch.length === 0) break;

    const images = await getOrderItemImages(batch.map((i) => ({ id: i.id, variantId: i.variant_id, productId: i.product_id })));
    const variantIds = [...new Set(batch.map((i) => i.variant_id).filter((v): v is string => !!v))];
    const { data: variants } = variantIds.length
      ? await supabaseService.from("product_variants").select("id, title").in("id", variantIds)
      : { data: [] as { id: string; title: string }[] };
    const variantTitleById = new Map((variants ?? []).map((v) => [v.id, v.title]));

    for (const item of batch) {
      const image = images[item.id];
      const { error: updateError } = await supabaseService
        .from("order_items")
        .update({
          image_url: image?.imageUrl ?? null,
          image_is_variant_specific: image?.isVariantSpecific ?? false,
          variant_title_snapshot: item.variant_id ? variantTitleById.get(item.variant_id) ?? null : null,
        })
        // Same guard as the select above (image_is_variant_specific, not image_url) -- prevents
        // double-processing if this script is ever re-run concurrently with itself or with
        // upsertShopifyOrder snapshotting the same row.
        .eq("id", item.id)
        .is("image_is_variant_specific", null);
      if (updateError) {
        console.error(`Failed to backfill order_item ${item.id}: ${updateError.message}`);
        continue;
      }
      totalUpdated += 1;
    }
    console.log(`Backfilled ${totalUpdated} so far...`);
    if (batch.length < BATCH_SIZE) break;
  }
  console.log(`Done. Backfilled ${totalUpdated} order_items.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
