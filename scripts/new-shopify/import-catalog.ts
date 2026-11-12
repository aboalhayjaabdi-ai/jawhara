// Clone the live store's catalog (products, variants, collections) into the NEW Shopify store.
//
// Source: a read-only dump of the live store made by dump-old-store.ts (nothing here ever writes to
// the live store or to Supabase). Target: NEW_SHOPIFY_STORE_DOMAIN only, via ./client.ts.
//
// Copies the live store exactly as it is set up today: same handles, titles, descriptions, vendor,
// tags, template suffix, category, status, option names/values/order, variant order, SKU, price,
// compare-at price, taxable=false, inventory policy, tracked=false, requires shipping, weight,
// quantities, collection membership + order, and sales-channel publication. No images (the live
// store has none). Shopify assigns every product/variant its own new unique ID.
//
// Idempotent: products are upserted by handle (productSet), collections are matched by handle, and
// collection membership/order is reconciled to the source. Safe to re-run at any time.
//
// Usage: npx tsx scripts/new-shopify/import-catalog.ts <old-store.json> [--handles=a,b] [--skip-collections]
import { readFileSync } from "node:fs";
import { newShopifyGraphQL as gql } from "./client.ts";

const dumpPath = process.argv[2];
if (!dumpPath) throw new Error("usage: import-catalog.ts <old-store.json> [--handles=a,b] [--skip-collections]");
const onlyHandles = process.argv.find((a) => a.startsWith("--handles="))?.slice(10).split(",");
const skipCollections = process.argv.includes("--skip-collections");

const old = JSON.parse(readFileSync(dumpPath, "utf8")) as { products: any[]; collections: any[] };

// ---- target store lookups ---------------------------------------------------------------------
const meta = await gql(`{ publications(first:20){ nodes { id name } } locations(first:10){ nodes { id isActive fulfillsOnlineOrders } } }`);
const pubByName = new Map<string, string>(meta.publications.nodes.map((p: any) => [p.name, p.id]));
const headlessName = [...pubByName.keys()].find((n) => /headless/i.test(n));
// Live-store channel name -> new-store publication id. Lovable is intentionally not carried over.
const PUB_MAP: Record<string, string | undefined> = {
  "Online Store": pubByName.get("Online Store"),
  Shop: pubByName.get("Shop"),
  "Jawhara Headless": headlessName ? pubByName.get(headlessName) : undefined,
};
if (!PUB_MAP["Online Store"] || !PUB_MAP["Jawhara Headless"]) throw new Error("New store is missing Online Store or Headless publication");
const location = meta.locations.nodes.find((l: any) => l.isActive && l.fulfillsOnlineOrders) ?? meta.locations.nodes[0];
const locationId: string = location.id;

function targetPubs(resourcePublications: any): string[] {
  return resourcePublications.nodes
    .filter((n: any) => n.isPublished)
    .map((n: any) => PUB_MAP[n.publication.name])
    .filter((id: string | undefined): id is string => !!id);
}

async function syncPublications(id: string, wanted: string[]) {
  const cur = await gql(`query($id:ID!){ node(id:$id){ ... on Publishable { resourcePublicationsV2(first:20){ nodes { publication { id } isPublished } } } } }`, { id });
  const published = new Set<string>(cur.node.resourcePublicationsV2.nodes.filter((n: any) => n.isPublished).map((n: any) => n.publication.id));
  const toAdd = wanted.filter((p) => !published.has(p));
  const toRemove = [...published].filter((p) => !wanted.includes(p));
  if (toAdd.length) {
    const r = await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id,input:$input){ userErrors { field message } } }`,
      { id, input: toAdd.map((publicationId) => ({ publicationId })) });
    if (r.publishablePublish.userErrors.length) throw new Error(`publish ${id}: ${JSON.stringify(r.publishablePublish.userErrors)}`);
  }
  if (toRemove.length) {
    const r = await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishableUnpublish(id:$id,input:$input){ userErrors { field message } } }`,
      { id, input: toRemove.map((publicationId) => ({ publicationId })) });
    if (r.publishableUnpublish.userErrors.length) throw new Error(`unpublish ${id}: ${JSON.stringify(r.publishableUnpublish.userErrors)}`);
  }
}

async function allNodes(query: string, pick: (d: any) => any, vars: Record<string, unknown> = {}) {
  const nodes: any[] = [];
  let after: string | null = null;
  for (;;) {
    const d = await gql(query, { ...vars, after });
    const c = pick(d);
    nodes.push(...c.nodes);
    if (!c.pageInfo.hasNextPage) break;
    after = c.pageInfo.endCursor;
  }
  return nodes;
}

// ---- products -----------------------------------------------------------------------------------
const products = onlyHandles ? old.products.filter((p) => onlyHandles.includes(p.handle)) : old.products;
console.log(`Products to upsert: ${products.length} (location ${locationId}, headless channel "${headlessName}")`);

const failures: { handle: string; error: string }[] = [];
let done = 0;
for (const p of products) {
  try {
    const options = [...p.options].sort((a: any, b: any) => a.position - b.position);
    const variants = [...p.variants.nodes].sort((a: any, b: any) => a.position - b.position);
    const input: Record<string, unknown> = {
      handle: p.handle,
      title: p.title,
      status: p.status,
      descriptionHtml: p.descriptionHtml ?? "",
      vendor: p.vendor ?? "",
      productType: p.productType ?? "",
      tags: p.tags,
      templateSuffix: p.templateSuffix ?? null,
      category: p.category?.id ?? null,
      seo: { title: p.seo?.title ?? null, description: p.seo?.description ?? null },
      productOptions: options.map((o: any, i: number) => ({ name: o.name, position: i + 1, values: o.values.map((name: string) => ({ name })) })),
      variants: variants.map((v: any, i: number) => ({
        position: i + 1,
        optionValues: v.selectedOptions.map((so: any) => ({ optionName: so.name, name: so.value })),
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        sku: v.sku ?? null,
        ...(v.barcode ? { barcodes: [v.barcode] } : {}),
        taxable: v.taxable,
        inventoryPolicy: v.inventoryPolicy,
        inventoryItem: {
          tracked: v.inventoryItem.tracked,
          requiresShipping: v.inventoryItem.requiresShipping,
          measurement: { weight: v.inventoryItem.measurement.weight },
        },
        inventoryQuantities: [{ locationId, name: "available", quantity: v.inventoryQuantity ?? 0 }],
      })),
    };
    const r = await gql(
      `mutation($input:ProductSetInput!,$identifier:ProductSetIdentifiers!){
        productSet(input:$input, identifier:$identifier, synchronous:true){ product { id } userErrors { field message code } }
      }`,
      { input, identifier: { handle: p.handle } }
    );
    if (r.productSet.userErrors.length) throw new Error(JSON.stringify(r.productSet.userErrors));
    await syncPublications(r.productSet.product.id, targetPubs(p.resourcePublicationsV2));
    done++;
    if (done % 25 === 0) console.log(`  ...${done}/${products.length}`);
  } catch (e: any) {
    failures.push({ handle: p.handle, error: e.message.slice(0, 600) });
    console.error(`FAILED ${p.handle}: ${e.message.slice(0, 600)}`);
  }
}
console.log(`Products: ${done} ok, ${failures.length} failed.`);

// ---- collections --------------------------------------------------------------------------------
if (!skipCollections && !onlyHandles) {
  const newProducts = await allNodes(`query($after:String){ products(first:250, after:$after){ nodes { id handle } pageInfo { hasNextPage endCursor } } }`, (d) => d.products);
  const newIdByHandle = new Map<string, string>(newProducts.map((p: any) => [p.handle, p.id]));
  const oldHandleById = new Map<string, string>(old.products.map((p: any) => [p.id, p.handle]));
  const existing = await allNodes(`query($after:String){ collections(first:250, after:$after){ nodes { id handle } pageInfo { hasNextPage endCursor } } }`, (d) => d.collections);
  const collIdByHandle = new Map<string, string>(existing.map((c: any) => [c.handle, c.id]));

  let cOk = 0;
  for (const c of old.collections) {
    try {
      // The new store's own "frontpage" (Startsida) already exists; leave its title as is.
      const input: Record<string, unknown> = {
        handle: c.handle,
        sortOrder: c.sortOrder,
        templateSuffix: c.templateSuffix ?? null,
        ...(c.handle === "frontpage" && collIdByHandle.has("frontpage") ? {} : { title: c.title }),
        descriptionHtml: c.descriptionHtml ?? "",
        seo: { title: c.seo?.title ?? null, description: c.seo?.description ?? null },
      };
      let id = collIdByHandle.get(c.handle);
      if (id) {
        const r = await gql(`mutation($input:CollectionInput!){ collectionUpdate(input:$input){ userErrors { field message } } }`, { input: { ...input, id } });
        if (r.collectionUpdate.userErrors.length) throw new Error(JSON.stringify(r.collectionUpdate.userErrors));
      } else {
        const r = await gql(`mutation($input:CollectionInput!){ collectionCreate(input:$input){ collection { id } userErrors { field message } } }`, { input });
        if (r.collectionCreate.userErrors.length) throw new Error(JSON.stringify(r.collectionCreate.userErrors));
        id = r.collectionCreate.collection.id as string;
        collIdByHandle.set(c.handle, id);
      }

      // Membership, in the live store's order.
      const wanted: string[] = c.productIds.map((oid: string) => newIdByHandle.get(oldHandleById.get(oid)!)).filter(Boolean);
      const current = (await allNodes(
        `query($id:ID!,$after:String){ collection(id:$id){ products(first:250, after:$after, sortKey: COLLECTION_DEFAULT){ nodes { id } pageInfo { hasNextPage endCursor } } } }`,
        (d) => d.collection.products, { id }
      )).map((n: any) => n.id);
      const extra = current.filter((x) => !wanted.includes(x));
      if (extra.length) {
        const r = await gql(`mutation($id:ID!,$p:[ID!]!){ collectionRemoveProducts(id:$id, productIds:$p){ userErrors { field message } } }`, { id, p: extra });
        if (r.collectionRemoveProducts.userErrors.length) throw new Error(JSON.stringify(r.collectionRemoveProducts.userErrors));
      }
      const missing = wanted.filter((x) => !current.includes(x));
      for (let i = 0; i < missing.length; i += 250) {
        const r = await gql(`mutation($id:ID!,$p:[ID!]!){ collectionAddProducts(id:$id, productIds:$p){ userErrors { field message } } }`, { id, p: missing.slice(i, i + 250) });
        if (r.collectionAddProducts.userErrors.length) throw new Error(JSON.stringify(r.collectionAddProducts.userErrors));
      }
      if (c.sortOrder === "MANUAL" && wanted.length > 1) {
        const now = (await allNodes(
          `query($id:ID!,$after:String){ collection(id:$id){ products(first:250, after:$after, sortKey: COLLECTION_DEFAULT){ nodes { id } pageInfo { hasNextPage endCursor } } } }`,
          (d) => d.collection.products, { id }
        )).map((n: any) => n.id);
        if (JSON.stringify(now) !== JSON.stringify(wanted)) {
          const moves = wanted.map((pid, i) => ({ id: pid, newPosition: String(i) }));
          for (let i = 0; i < moves.length; i += 250) {
            const r = await gql(`mutation($id:ID!,$m:[MoveInput!]!){ collectionReorderProducts(id:$id, moves:$m){ job { id } userErrors { field message } } }`, { id, m: moves.slice(i, i + 250) });
            if (r.collectionReorderProducts.userErrors.length) throw new Error(JSON.stringify(r.collectionReorderProducts.userErrors));
          }
        }
      }
      await syncPublications(id, targetPubs(c.resourcePublicationsV2));
      cOk++;
    } catch (e: any) {
      failures.push({ handle: `collection:${c.handle}`, error: e.message.slice(0, 600) });
      console.error(`FAILED collection ${c.handle}: ${e.message.slice(0, 600)}`);
    }
  }
  console.log(`Collections: ${cOk}/${old.collections.length} ok.`);
}

if (failures.length) {
  console.log(JSON.stringify(failures, null, 1));
  process.exitCode = 1;
}
