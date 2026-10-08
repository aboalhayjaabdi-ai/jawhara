import { paginateAll, shopifyGraphQL } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

const RESOURCE = "collections";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

resetResource(RESOURCE);

const QUERY = `
  query($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          handle
          descriptionHtml
          sortOrder
          updatedAt
          seo { title description }
          image { id url altText }
          ruleSet { appliedDisjunctively rules { column relation condition } }
          productsCount { count }
          products(first: 250) { edges { node { id } } pageInfo { hasNextPage } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

// Collections can have more than 250 products (Shopify's per-field page cap); this
// paginates the nested `products` connection for any collection that needs more pages.
const PRODUCTS_PAGE_QUERY = `
  query($id: ID!, $after: String) {
    collection(id: $id) {
      products(first: 250, after: $after) {
        edges { cursor node { id } }
        pageInfo { hasNextPage }
      }
    }
  }
`;

async function fullProductIds(collectionId: string) {
  // The outer multi-collection query's cursor isn't portable to this standalone
  // single-collection query shape (confirmed: passing it just re-returns page 1).
  // So for any collection over 250 products, re-paginate it from scratch here,
  // using only cursors produced by this same query shape throughout.
  const ids: string[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data: any = await shopifyGraphQL(PRODUCTS_PAGE_QUERY, { id: collectionId, after });
    const edges = data.collection.products.edges;
    ids.push(...edges.map((e: any) => e.node.id));
    hasNextPage = data.collection.products.pageInfo.hasNextPage;
    after = edges.length ? edges[edges.length - 1].cursor : null;
  }
  return ids;
}

const total = await paginateAll(
  QUERY,
  (data: any) => data.collections,
  async (nodes, pageNum) => {
    for (const node of nodes) {
      if (node.products.pageInfo.hasNextPage) {
        const allIds = await fullProductIds(node.id);
        node.products = { edges: allIds.map((id) => ({ node: { id } })) };
      }
    }
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} collections`);
  },
  25
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
