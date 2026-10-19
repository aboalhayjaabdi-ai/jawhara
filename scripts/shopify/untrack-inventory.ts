// Turns off inventory tracking (InventoryItem.tracked = false) on every variant of every product
// that this migration created from Supabase -- i.e. every Supabase product handle, found by
// matching live Shopify products against those handles. Does not touch the pre-existing unrelated
// products in the store (the ones with no matching Supabase handle).
// Idempotent: skips any variant that's already untracked.
import { selectAll } from "../supabase/rest.ts";
import { shopifyGraphQL, paginateAll } from "./client.ts";

interface Product {
  handle: string;
}

const sbProducts = await selectAll<Product>("products", "select=handle");
const sbHandles = new Set(sbProducts.map((p) => p.handle));

const shProducts: any[] = [];
await paginateAll(
  `query($first:Int!,$after:String){
    products(first:$first,after:$after){
      edges{cursor,node{
        id,handle,
        variants(first:100){edges{node{id,inventoryItem{id,tracked}}}}
      }}
      pageInfo{hasNextPage}
    }
  }`,
  (d: any) => d.products,
  (nodes: any[]) => shProducts.push(...nodes)
);

const ours = shProducts.filter((p) => sbHandles.has(p.handle));
console.log(`${shProducts.length} products in store, ${ours.length} match a Supabase handle.`);

let updatedProducts = 0;
let updatedVariants = 0;
let alreadyUntracked = 0;

for (const p of ours) {
  const variantNodes = p.variants.edges.map((e: any) => e.node);
  const toUpdate = variantNodes.filter((v: any) => v.inventoryItem.tracked !== false);
  alreadyUntracked += variantNodes.length - toUpdate.length;
  if (toUpdate.length === 0) continue;

  const result = await shopifyGraphQL<any>(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    {
      productId: p.id,
      variants: toUpdate.map((v: any) => ({ id: v.id, inventoryItem: { tracked: false } })),
    }
  );

  const errors = result.productVariantsBulkUpdate.userErrors;
  if (errors.length) {
    console.error(`FAILED ${p.handle}:`, JSON.stringify(errors));
    continue;
  }

  updatedProducts++;
  updatedVariants += toUpdate.length;
  if (updatedProducts % 25 === 0) console.log(`...${updatedProducts}/${ours.length} products`);
}

console.log(
  `\nDone. Untracked ${updatedVariants} variant(s) across ${updatedProducts} product(s). ${alreadyUntracked} variant(s) were already untracked.`
);
