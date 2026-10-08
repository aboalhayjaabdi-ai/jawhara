import { upsert } from "../rest.ts";
import { idTail, readJsonl } from "./util.ts";

const collections = readJsonl("collections");

const rows = collections.map((c: any) => ({
  shopify_id: idTail(c.id),
  title: c.title,
  handle: c.handle,
  description_html: c.descriptionHtml || null,
  sort_order: c.sortOrder,
  image_url: c.image?.url ?? null,
  seo_title: c.seo?.title ?? null,
  seo_description: c.seo?.description ?? null,
}));

const result = await upsert("collections", rows, "shopify_id");
console.log(`✓ collections: ${result.length} upserted`);
