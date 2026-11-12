// READ-ONLY: dumps the live (old) store's full catalog (products, variants, collections) to a JSON file.
// Never writes to Shopify or Supabase.
import { writeFileSync } from "node:fs";
import { shopifyGraphQL } from "../../lib/shopify/client.ts";

const out = process.argv[2];
if (!out) throw new Error("usage: dump-old-store.ts <out.json>");

async function all(query: string, pick: (d: any) => any) {
  const nodes: any[] = []; let after: string | null = null;
  for (;;) {
    const d = await shopifyGraphQL<any>(query, { after });
    const c = pick(d); nodes.push(...c.nodes);
    if (!c.pageInfo.hasNextPage) break; after = c.pageInfo.endCursor;
  }
  return nodes;
}

const products = await all(`query($after:String){ products(first:50, after:$after){ nodes {
  id handle title status vendor productType tags templateSuffix descriptionHtml giftCardTemplateSuffix
  seo { title description } category { id } options { name position values }
  mediaCount { count } metafields(first:5){ nodes { namespace key } }
  resourcePublicationsV2(first:10){ nodes { publication { id name } isPublished } }
  variants(first:250){ nodes { id title sku barcode price compareAtPrice taxable inventoryPolicy position
    selectedOptions { name value } inventoryQuantity
    inventoryItem { tracked requiresShipping measurement { weight { value unit } } } } }
} pageInfo { hasNextPage endCursor } } }`, (d) => d.products);

const collections = await all(`query($after:String){ collections(first:50, after:$after){ nodes {
  id handle title descriptionHtml sortOrder templateSuffix seo { title description } ruleSet { appliedDisjunctively rules { column relation condition } }
  image { url } productsCount { count }
  resourcePublicationsV2(first:10){ nodes { publication { name } isPublished } }
} pageInfo { hasNextPage endCursor } } }`, (d) => d.collections);

for (const c of collections) {
  c.productIds = (await all(`query($after:String){ collection(id:"${c.id}"){ products(first:250, after:$after, sortKey: COLLECTION_DEFAULT){ nodes { id } pageInfo { hasNextPage endCursor } } } }`,
    (d) => d.collection.products)).map((n: any) => n.id);
}

writeFileSync(out, JSON.stringify({ dumpedAt: new Date().toISOString(), products, collections }, null, 1));
console.log(`old store: ${products.length} products, ${products.reduce((s, p) => s + p.variants.nodes.length, 0)} variants, ${collections.length} collections -> ${out}`);
