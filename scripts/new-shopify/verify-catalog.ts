// READ-ONLY: field-by-field check that the NEW store's catalog matches the live store's dump, and
// writes the old -> new ID mapping (products, variants, collections) used on switch-over day.
//
// Usage: npx tsx scripts/new-shopify/verify-catalog.ts <old-store.json> <mapping-out.json> [--handles=a,b]
import { readFileSync, writeFileSync } from "node:fs";
import { newShopifyGraphQL as gql } from "./client.ts";

const [dumpPath, mapPath] = process.argv.slice(2);
if (!dumpPath || !mapPath) throw new Error("usage: verify-catalog.ts <old-store.json> <mapping-out.json> [--handles=a,b]");
const onlyHandles = process.argv.find((a) => a.startsWith("--handles="))?.slice(10).split(",");
const old = JSON.parse(readFileSync(dumpPath, "utf8")) as { products: any[]; collections: any[] };

const PUB_NAME = (n: string) => (/headless/i.test(n) ? "HEADLESS" : n);

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

const newProducts = await allNodes(`query($after:String){ products(first:50, after:$after){ nodes {
  id handle title status vendor productType tags templateSuffix descriptionHtml
  seo { title description } category { id } options { name position values } mediaCount { count }
  resourcePublicationsV2(first:10){ nodes { publication { name } isPublished } }
  variants(first:250){ nodes { id title sku barcode price compareAtPrice taxable inventoryPolicy position
    selectedOptions { name value } inventoryQuantity
    inventoryItem { tracked requiresShipping measurement { weight { value unit } } } } }
} pageInfo { hasNextPage endCursor } } }`, (d) => d.products);
const byHandle = new Map<string, any>(newProducts.map((p: any) => [p.handle, p]));

const issues: string[] = [];
const bad = (m: string) => issues.push(m);
const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const pubs = (rp: any) => rp.nodes.filter((n: any) => n.isPublished).map((n: any) => PUB_NAME(n.publication.name)).filter((n: string) => n !== "Lovable").sort();

const mapping = { generatedAt: new Date().toISOString(), products: {} as Record<string, string>, variants: {} as Record<string, string>, collections: {} as Record<string, string> };
const srcProducts = onlyHandles ? old.products.filter((p) => onlyHandles.includes(p.handle)) : old.products;
let variantCount = 0;

for (const o of srcProducts) {
  const n = byHandle.get(o.handle);
  if (!n) { bad(`missing product ${o.handle}`); continue; }
  mapping.products[o.id] = n.id;
  for (const f of ["title", "status", "vendor", "productType", "templateSuffix", "descriptionHtml"]) {
    if (!eq(o[f] || null, n[f] || null)) bad(`${o.handle}: ${f} "${o[f]}" vs "${n[f]}"`);
  }
  if (!eq([...o.tags].sort(), [...n.tags].sort())) bad(`${o.handle}: tags`);
  if (!eq(o.seo, n.seo)) bad(`${o.handle}: seo`);
  if (!eq(o.category?.id, n.category?.id)) bad(`${o.handle}: category`);
  if (n.mediaCount.count !== 0) bad(`${o.handle}: has media`);
  const opt = (x: any[]) => [...x].sort((a, b) => a.position - b.position).map((y) => [y.name, y.values]);
  if (!eq(opt(o.options), opt(n.options))) bad(`${o.handle}: options ${JSON.stringify(opt(o.options))} vs ${JSON.stringify(opt(n.options))}`);
  if (!eq(pubs(o.resourcePublicationsV2), pubs(n.resourcePublicationsV2))) bad(`${o.handle}: channels ${pubs(o.resourcePublicationsV2)} vs ${pubs(n.resourcePublicationsV2)}`);

  const ov = [...o.variants.nodes].sort((a, b) => a.position - b.position);
  const nv = [...n.variants.nodes].sort((a: any, b: any) => a.position - b.position);
  if (ov.length !== nv.length) { bad(`${o.handle}: ${ov.length} vs ${nv.length} variants`); continue; }
  ov.forEach((a, i) => {
    const b = nv[i];
    const k = `${o.handle}/${a.title}`;
    if (!eq(a.selectedOptions, b.selectedOptions)) { bad(`${k}: options/order`); return; }
    mapping.variants[a.id] = b.id;
    variantCount++;
    for (const f of ["title", "sku", "barcode", "price", "compareAtPrice", "taxable", "inventoryPolicy", "inventoryQuantity"]) {
      if (!eq(a[f], b[f])) bad(`${k}: ${f} ${JSON.stringify(a[f])} vs ${JSON.stringify(b[f])}`);
    }
    if (!eq(a.inventoryItem, b.inventoryItem)) bad(`${k}: inventoryItem ${JSON.stringify(a.inventoryItem)} vs ${JSON.stringify(b.inventoryItem)}`);
    if (b.taxable !== false) bad(`${k}: taxable is not false`);
  });
}
if (!onlyHandles) {
  const extra = newProducts.filter((p: any) => !old.products.some((o) => o.handle === p.handle));
  for (const p of extra) bad(`extra product in new store: ${p.handle}`);
}

let collChecked = 0;
if (!onlyHandles) {
  const oldHandleById = new Map<string, string>(old.products.map((p: any) => [p.id, p.handle]));
  const newHandleById = new Map<string, string>(newProducts.map((p: any) => [p.id, p.handle]));
  const newColls = await allNodes(`query($after:String){ collections(first:50, after:$after){ nodes {
    id handle title descriptionHtml sortOrder templateSuffix seo { title description } image { url }
    resourcePublicationsV2(first:10){ nodes { publication { name } isPublished } } } pageInfo { hasNextPage endCursor } } }`, (d) => d.collections);
  const cByHandle = new Map<string, any>(newColls.map((c: any) => [c.handle, c]));
  for (const o of old.collections) {
    const n = cByHandle.get(o.handle);
    if (!n) { bad(`missing collection ${o.handle}`); continue; }
    mapping.collections[o.id] = n.id;
    collChecked++;
    if (o.handle !== "frontpage" && o.title !== n.title) bad(`collection ${o.handle}: title`);
    if (o.sortOrder !== n.sortOrder) bad(`collection ${o.handle}: sortOrder ${o.sortOrder} vs ${n.sortOrder}`);
    if (!eq(o.descriptionHtml || null, n.descriptionHtml || null)) bad(`collection ${o.handle}: description`);
    if (n.image) bad(`collection ${o.handle}: has image`);
    if (!eq(pubs(o.resourcePublicationsV2), pubs(n.resourcePublicationsV2))) bad(`collection ${o.handle}: channels ${pubs(o.resourcePublicationsV2)} vs ${pubs(n.resourcePublicationsV2)}`);
    const members = (await allNodes(
      `query($id:ID!,$after:String){ collection(id:$id){ products(first:250, after:$after, sortKey: COLLECTION_DEFAULT){ nodes { id } pageInfo { hasNextPage endCursor } } } }`,
      (d) => d.collection.products, { id: n.id }
    )).map((x: any) => newHandleById.get(x.id));
    const want = o.productIds.map((id: string) => oldHandleById.get(id));
    const same = o.sortOrder === "MANUAL" ? eq(want, members) : eq([...want].sort(), [...members].sort());
    if (!same) bad(`collection ${o.handle}: members (${want.length} vs ${members.length})${o.sortOrder === "MANUAL" ? " or order" : ""}`);
  }
}

writeFileSync(mapPath, JSON.stringify(mapping, null, 1));
const uniqueP = new Set(Object.values(mapping.products)).size, uniqueV = new Set(Object.values(mapping.variants)).size;
console.log(`Checked ${srcProducts.length} products, ${variantCount} variants, ${collChecked} collections.`);
console.log(`Unique new IDs: ${uniqueP} products, ${uniqueV} variants. Mapping -> ${mapPath}`);
console.log(issues.length ? `${issues.length} difference(s):\n  ${issues.slice(0, 60).join("\n  ")}` : "No differences.");
if (issues.length) process.exitCode = 1;
