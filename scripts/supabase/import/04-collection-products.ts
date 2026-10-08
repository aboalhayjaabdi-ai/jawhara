import { insertMany, selectAll } from "../rest.ts";
import { chunk, idTail, readJsonl } from "./util.ts";

const collections = readJsonl("collections");
const collectionIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("collections", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);
const productIdByShopify = new Map(
  (await selectAll<{ id: string; shopify_id: string }>("products", "select=id,shopify_id")).map((r) => [r.shopify_id, r.id])
);

const rows: any[] = [];
for (const c of collections) {
  const collectionId = collectionIdByShopify.get(idTail(c.id)!);
  c.products.edges.forEach((edge: any, position: number) => {
    const productId = productIdByShopify.get(idTail(edge.node.id)!);
    if (collectionId && productId) rows.push({ collection_id: collectionId, product_id: productId, position });
  });
}

let inserted = 0;
for (const batch of chunk(rows, 500)) {
  inserted += await insertMany("collection_products", batch, "collection_id,product_id");
}
console.log(`✓ collection_products: ${inserted} links inserted (${rows.length} expected)`);
