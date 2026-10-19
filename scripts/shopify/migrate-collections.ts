// One-time Supabase -> new Shopify store (JAWHARA) collection migration.
// Idempotent: skips any handle that already exists in the target store, so it's safe to rerun.
// Does not touch the "frontpage" collection or anything else not present in Supabase.
import { selectAll } from "../supabase/rest.ts";
import { shopifyGraphQL, paginateAll } from "./client.ts";

interface Collection {
  id: string;
  title: string;
  handle: string;
  description_html: string | null;
  sort_order: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

const ONLINE_STORE_PUBLICATION_ID = "gid://shopify/Publication/341839872382";

const collections = await selectAll<Collection>("collections", "select=*&order=title");

const existing: { handle: string }[] = [];
await paginateAll(
  `query($first:Int!,$after:String){collections(first:$first,after:$after){edges{cursor,node{handle}} pageInfo{hasNextPage}}}`,
  (d: any) => d.collections,
  (nodes: any[]) => existing.push(...nodes)
);
const existingHandles = new Set(existing.map((c) => c.handle));

const toCreate = collections.filter((c) => !existingHandles.has(c.handle));
console.log(`${collections.length} collections in Supabase, ${existingHandles.size} already in Shopify, ${toCreate.length} to create.`);

let created = 0;
for (const c of toCreate) {
  const input: Record<string, unknown> = {
    title: c.title,
    handle: c.handle,
  };
  if (c.description_html) input.descriptionHtml = c.description_html;
  if (c.sort_order) input.sortOrder = c.sort_order;
  if (c.seo_title || c.seo_description) {
    input.seo = { title: c.seo_title ?? undefined, description: c.seo_description ?? undefined };
  }

  const result = await shopifyGraphQL<any>(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) { collection { id handle } userErrors { field message } }
    }`,
    { input }
  );
  const { collection, userErrors } = result.collectionCreate;
  if (userErrors.length) {
    console.error(`FAILED ${c.handle}:`, JSON.stringify(userErrors));
    continue;
  }

  const pub = await shopifyGraphQL<any>(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) { userErrors { field message } }
    }`,
    { id: collection.id, input: [{ publicationId: ONLINE_STORE_PUBLICATION_ID }] }
  );
  if (pub.publishablePublish.userErrors.length) {
    console.error(`PUBLISH FAILED ${c.handle}:`, JSON.stringify(pub.publishablePublish.userErrors));
  }

  created++;
  console.log(`Created + published: ${c.handle}`);
}

console.log(`\nDone. Created ${created}/${toCreate.length} collections.`);
