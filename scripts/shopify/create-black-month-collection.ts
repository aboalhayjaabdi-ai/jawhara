// One-time setup of the "Black Month" campaign collection: a MANUAL collection in Shopify (so it
// exists where the products and checkout live), mirrored into Supabase (collections +
// collection_products) because that is what the storefront actually reads -- same two-sided
// pattern as scripts/supabase/import/10-amarenti-import.ts.
//
// Only ever ADDS: creates the collection if missing and adds existing products to it. Never
// creates/edits products, prices, compare-at prices, discounts or any other collection.
//
// After this initial setup, the selection is maintained in Jawhara admin -> Kollektioner ->
// "Black Month" (that is the copy the website renders from).
//
// Usage:
//   npx tsx scripts/shopify/create-black-month-collection.ts            # dry run (no writes)
//   npx tsx scripts/shopify/create-black-month-collection.ts --commit   # real run
import { shopifyGraphQL } from "./client.ts";
import { upsert, insertMany, selectAll } from "../supabase/rest.ts";
import { idTail } from "../supabase/import/util.ts";

const COMMIT = process.argv.includes("--commit");
const HANDLE = "black-month";
const TITLE = "Black Month";

// Display order. The first 8 are what the homepage section shows; the Black Month page shows all.
// Bags first (campaign priority), then one gift set and one popular "3 för 2" jewelry piece.
const PRODUCT_HANDLES = [
  "vivi-vaska",
  "amelie-vaska-5",
  "dahlia-vaska",
  "mimi-vaska",
  "colette-vaska-1",
  "millie-vaska",
  "alma-vaska",
  "jolie-vaska",
  "giselle-vaska",
  "mila-vaska",
  "dior-giftset",
  "klover-armband",
];

const Q = {
  collectionByHandle: `query($handle: String!) { collectionByIdentifier(identifier: { handle: $handle }) { id handle products(first: 250, sortKey: COLLECTION_DEFAULT) { nodes { id handle } } } }`,
  productByHandle: `query($handle: String!) { productByIdentifier(identifier: { handle: $handle }) { id handle status } }`,
  collectionCreate: `mutation($collection: CollectionCreateInput!) { collectionCreate(collection: $collection) { collection { id handle } userErrors { field message } } }`,
  addProducts: `mutation($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { id } userErrors { field message } } }`,
  reorder: `mutation($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id done } userErrors { field message } } }`,
  // Publish to the same sales channels the main bag collection is on.
  referencePublications: `query { collectionByIdentifier(identifier: { handle: "vaskor-och-tillbehor" }) { resourcePublications(first: 20) { nodes { publication { id name } } } } }`,
  publish: `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
};

function userErrors(where: string, errs: { field: string[] | null; message: string }[] | undefined) {
  if (errs?.length) throw new Error(`${where}: ${errs.map((e) => `${(e.field ?? []).join(".")} ${e.message}`).join("; ")}`);
}

async function main() {
  console.log(COMMIT ? "COMMIT -- real writes will happen." : "DRY RUN -- no writes. Pass --commit to execute.");

  // 1. Resolve every product in Shopify (by handle) and in Supabase -- abort if any is missing.
  const shopifyProducts: { id: string; handle: string }[] = [];
  for (const handle of PRODUCT_HANDLES) {
    const { productByIdentifier: p } = await shopifyGraphQL<{ productByIdentifier: { id: string; handle: string; status: string } | null }>(Q.productByHandle, { handle });
    if (!p) throw new Error(`Shopify product not found: ${handle}`);
    if (p.status !== "ACTIVE") throw new Error(`Shopify product not active: ${handle} (${p.status})`);
    shopifyProducts.push(p);
  }
  const supabaseProducts = await selectAll<{ id: string; handle: string; status: string }>(
    "products",
    `select=id,handle,status&handle=in.(${PRODUCT_HANDLES.join(",")})`
  );
  const supabaseIdByHandle = new Map(supabaseProducts.map((p) => [p.handle, p.id]));
  const missing = PRODUCT_HANDLES.filter((h) => !supabaseIdByHandle.has(h));
  if (missing.length) throw new Error(`Supabase products not found: ${missing.join(", ")}`);
  console.log(`✓ all ${PRODUCT_HANDLES.length} products exist and are active in Shopify and Supabase`);

  // 2. Shopify collection (create if missing).
  let { collectionByIdentifier: collection } = await shopifyGraphQL<{ collectionByIdentifier: { id: string; products: { nodes: { id: string }[] } } | null }>(
    Q.collectionByHandle,
    { handle: HANDLE }
  );
  if (!collection) {
    console.log(`${COMMIT ? "creating" : "would create"} Shopify collection "${TITLE}" (${HANDLE}, MANUAL)`);
    if (COMMIT) {
      const r = await shopifyGraphQL<{ collectionCreate: { collection: { id: string } | null; userErrors: any[] } }>(Q.collectionCreate, {
        collection: { title: TITLE, handle: HANDLE, sortOrder: "MANUAL" },
      });
      userErrors("collectionCreate", r.collectionCreate.userErrors);
      collection = { id: r.collectionCreate.collection!.id, products: { nodes: [] } };
    }
  } else {
    console.log(`✓ Shopify collection already exists: ${collection.id}`);
  }
  if (!COMMIT || !collection) return;

  // 3. Add products not already in it, then put them in PRODUCT_HANDLES order.
  const existing = new Set(collection.products.nodes.map((n) => n.id));
  const toAdd = shopifyProducts.filter((p) => !existing.has(p.id)).map((p) => p.id);
  if (toAdd.length) {
    const r = await shopifyGraphQL<{ collectionAddProducts: { userErrors: any[] } }>(Q.addProducts, { id: collection.id, productIds: toAdd });
    userErrors("collectionAddProducts", r.collectionAddProducts.userErrors);
  }
  console.log(`✓ Shopify: ${toAdd.length} products added (${existing.size} already present)`);
  const r = await shopifyGraphQL<{ collectionReorderProducts: { userErrors: any[] } }>(Q.reorder, {
    id: collection.id,
    moves: shopifyProducts.map((p, i) => ({ id: p.id, newPosition: String(i) })),
  });
  userErrors("collectionReorderProducts", r.collectionReorderProducts.userErrors);

  // 4. Publish to the same channels as the main bag collection.
  const ref = await shopifyGraphQL<{ collectionByIdentifier: { resourcePublications: { nodes: { publication: { id: string; name: string } }[] } } | null }>(Q.referencePublications);
  const publications = ref.collectionByIdentifier?.resourcePublications.nodes.map((n) => n.publication) ?? [];
  if (publications.length) {
    const p = await shopifyGraphQL<{ publishablePublish: { userErrors: any[] } }>(Q.publish, {
      id: collection.id,
      input: publications.map((pub) => ({ publicationId: pub.id })),
    });
    userErrors("publishablePublish", p.publishablePublish.userErrors);
  }
  console.log(`✓ Shopify: published to ${publications.map((p) => p.name).join(", ") || "(no reference publications found)"}`);

  // 5. Mirror into Supabase (what the storefront renders from).
  const [row] = await upsert<{ id: string }>(
    "collections",
    [
      {
        shopify_id: idTail(collection.id),
        title: TITLE,
        handle: HANDLE,
        source: "shopify",
        sort_order: "MANUAL",
        seo_title: "Black Month – utvalda erbjudanden",
        seo_description: "Upptäck Jawharas Black Month: utvalda väskor och smycken till kampanjpriser. Fri frakt inom Sverige.",
      },
    ],
    "handle"
  );
  await insertMany(
    "collection_products",
    PRODUCT_HANDLES.map((h, i) => ({ collection_id: row.id, product_id: supabaseIdByHandle.get(h), position: i })),
    "collection_id,product_id"
  );
  console.log(`✓ Supabase: collection ${row.id} with ${PRODUCT_HANDLES.length} products`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
