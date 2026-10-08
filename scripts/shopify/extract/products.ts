import { paginateAll } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

const RESOURCE = "products";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

resetResource(RESOURCE);

const QUERY = `
  query($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          productType
          vendor
          tags
          descriptionHtml
          createdAt
          updatedAt
          publishedAt
          seo { title description }
          options { id name position values }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                inventoryPolicy
                inventoryItem { id tracked }
                selectedOptions { name value }
                taxable
                barcode
                image { id url }
              }
            }
          }
          images(first: 50) {
            edges { node { id url altText width height } }
          }
          metafields(first: 100) {
            edges { node { namespace key type value } }
          }
          collections(first: 50) {
            edges { node { id handle } }
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const total = await paginateAll(
  QUERY,
  (data: any) => data.products,
  async (nodes, pageNum) => {
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} products`);
  },
  25
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
