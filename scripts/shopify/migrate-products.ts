// One-time Supabase -> new Shopify store (JAWHARA) product/variant migration.
//
// Idempotent: uses `productSet` with `identifier: { handle }`, which creates the product if the
// handle doesn't exist yet and otherwise updates it in place (including fully replacing its
// `collections` membership to match Supabase exactly) -- safe to rerun on partial failure.
//
// Option-axis naming convention (confirmed with the user; Supabase only stores option *values* in
// option1/2/3, never axis names):
//   - No variation (single variant, option1 null or "Default Title") -> no custom options.
//   - Single-axis variation (option1 set, option2/3 null) -> one option named "Storlek".
//   - The one 3-axis product (handle "rh-skal": color / läppglans add-on / phone model) ->
//     "Färg" / "Tillval" / "Telefonmodell".
//
// Run with optional `--handles=a,b,c` to migrate a specific subset (for spot-testing).
import { selectAll } from "../supabase/rest.ts";
import { shopifyGraphQL, paginateAll } from "./client.ts";

interface Product {
  id: string;
  title: string;
  handle: string;
  status: string;
  product_type: string | null;
  vendor: string | null;
  description_html: string | null;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
}
interface Variant {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  inventory_quantity: number;
  inventory_policy: string | null;
  taxable: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}
interface Collection {
  id: string;
  handle: string;
}
interface CollectionProduct {
  collection_id: string;
  product_id: string;
}

const ONLINE_STORE_PUBLICATION_ID = "gid://shopify/Publication/341839872382";
const SPECIAL_PHONE_CASE_HANDLE = "rh-skal";

const STATUS_MAP: Record<string, string> = { active: "ACTIVE", draft: "DRAFT", archived: "ARCHIVED" };

const onlyHandles = process.argv.find((a) => a.startsWith("--handles="))?.slice("--handles=".length).split(",");

const [products, variants, collections, collectionProducts] = await Promise.all([
  selectAll<Product>("products", "select=*&order=title"),
  selectAll<Variant>("product_variants", "select=*&order=product_id"),
  selectAll<Collection>("collections", "select=id,handle"),
  selectAll<CollectionProduct>("collection_products", "select=*"),
]);

const variantsByProduct = new Map<string, Variant[]>();
for (const v of variants) {
  if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
  variantsByProduct.get(v.product_id)!.push(v);
}
const collectionIdsByProduct = new Map<string, string[]>();
for (const cp of collectionProducts) {
  if (!collectionIdsByProduct.has(cp.product_id)) collectionIdsByProduct.set(cp.product_id, []);
  collectionIdsByProduct.get(cp.product_id)!.push(cp.collection_id);
}

const location = await shopifyGraphQL<any>(`{ locations(first: 1) { edges { node { id } } } }`);
const locationId = location.locations.edges[0].node.id;

const shopifyCollections: { id: string; handle: string }[] = [];
await paginateAll(
  `query($first:Int!,$after:String){collections(first:$first,after:$after){edges{cursor,node{id,handle}} pageInfo{hasNextPage}}}`,
  (d: any) => d.collections,
  (nodes: any[]) => shopifyCollections.push(...nodes)
);
const collectionIdByHandle = new Map(shopifyCollections.map((c) => [c.handle, c.id]));
const supabaseCollectionById = new Map(collections.map((c) => [c.id, c]));

function money(n: number): string {
  return n.toFixed(2);
}

function buildOptionsAndVariants(product: Product, vs: Variant[]) {
  if (product.handle === SPECIAL_PHONE_CASE_HANDLE) {
    const names = ["Färg", "Tillval", "Telefonmodell"] as const;
    const values = [
      [...new Set(vs.map((v) => v.option1!))],
      [...new Set(vs.map((v) => v.option2!))],
      [...new Set(vs.map((v) => v.option3!))],
    ];
    return {
      productOptions: names.map((name, i) => ({ name, values: values[i].map((v) => ({ name: v })) })),
      variantOptionValues: (v: Variant) => [
        { optionName: "Färg", name: v.option1! },
        { optionName: "Tillval", name: v.option2! },
        { optionName: "Telefonmodell", name: v.option3! },
      ],
    };
  }

  const hasRealOption1 = vs.some((v) => v.option1 && v.option1 !== "Default Title");
  if (!hasRealOption1) {
    return {
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variantOptionValues: () => [{ optionName: "Title", name: "Default Title" }],
    };
  }

  const values = [...new Set(vs.map((v) => v.option1!))];
  return {
    productOptions: [{ name: "Storlek", values: values.map((v) => ({ name: v })) }],
    variantOptionValues: (v: Variant) => [{ optionName: "Storlek", name: v.option1! }],
  };
}

let toMigrate = products;
if (onlyHandles) toMigrate = products.filter((p) => onlyHandles.includes(p.handle));

console.log(`Migrating ${toMigrate.length} product(s)...`);

let ok = 0;
let failed = 0;
const failures: { handle: string; errors: unknown }[] = [];

for (const p of toMigrate) {
  const vs = variantsByProduct.get(p.id) ?? [];
  if (vs.length === 0) {
    console.error(`SKIP ${p.handle}: no variants in Supabase`);
    failed++;
    continue;
  }

  const { productOptions, variantOptionValues } = buildOptionsAndVariants(p, vs);

  const collectionIds = (collectionIdsByProduct.get(p.id) ?? [])
    .map((cid) => supabaseCollectionById.get(cid)?.handle)
    .filter((h): h is string => !!h)
    .map((handle) => collectionIdByHandle.get(handle))
    .filter((id): id is string => !!id);

  const input: Record<string, unknown> = {
    title: p.title,
    handle: p.handle,
    status: STATUS_MAP[p.status] ?? "DRAFT",
    descriptionHtml: p.description_html ?? undefined,
    vendor: p.vendor ?? undefined,
    productType: p.product_type ?? undefined,
    tags: p.tags,
    collections: collectionIds,
    seo: p.seo_title || p.seo_description ? { title: p.seo_title ?? undefined, description: p.seo_description ?? undefined } : undefined,
    productOptions,
    variants: vs.map((v) => ({
      optionValues: variantOptionValues(v),
      price: money(v.price),
      compareAtPrice: v.compare_at_price != null ? money(v.compare_at_price) : undefined,
      sku: v.sku ?? undefined,
      taxable: v.taxable,
      inventoryPolicy: v.inventory_policy === "ALLOW" ? "CONTINUE" : "DENY",
      inventoryQuantities: [{ locationId, name: "available", quantity: v.inventory_quantity }],
    })),
  };

  const result = await shopifyGraphQL<any>(
    `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers!) {
      productSet(input: $input, synchronous: true, identifier: $identifier) {
        product { id handle }
        userErrors { field message }
      }
    }`,
    { input, identifier: { handle: p.handle } }
  );

  const { product, userErrors } = result.productSet;
  if (userErrors.length) {
    console.error(`FAILED ${p.handle}:`, JSON.stringify(userErrors));
    failures.push({ handle: p.handle, errors: userErrors });
    failed++;
    continue;
  }

  if (p.status === "active") {
    const pub = await shopifyGraphQL<any>(
      `mutation($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: product.id, input: [{ publicationId: ONLINE_STORE_PUBLICATION_ID }] }
    );
    if (pub.publishablePublish.userErrors.length) {
      console.error(`PUBLISH FAILED ${p.handle}:`, JSON.stringify(pub.publishablePublish.userErrors));
    }
  }

  ok++;
  if (ok % 25 === 0) console.log(`...${ok}/${toMigrate.length}`);
}

console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
if (failures.length) {
  console.log(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
