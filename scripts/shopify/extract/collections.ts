import { paginateAll } from "../client.ts";
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
          products(first: 250) { edges { node { id } } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const total = await paginateAll(
  QUERY,
  (data: any) => data.collections,
  async (nodes, pageNum) => {
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} collections`);
  },
  25
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
