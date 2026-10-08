import { paginateAll } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

const RESOURCE = "discounts";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

resetResource(RESOURCE);

const DISCOUNT_FIELDS = `
  __typename
  ... on DiscountCodeBasic {
    title status startsAt endsAt
    codes(first: 5) { edges { node { code } } }
    customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount currencyCode } } } }
    minimumRequirement { __typename ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount currencyCode } } }
  }
  ... on DiscountAutomaticBasic {
    title status startsAt endsAt
    customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount currencyCode } } } }
  }
  ... on DiscountCodeBxgy {
    title status startsAt endsAt
    codes(first: 5) { edges { node { code } } }
  }
  ... on DiscountAutomaticBxgy {
    title status startsAt endsAt
  }
  ... on DiscountCodeFreeShipping {
    title status startsAt endsAt
    codes(first: 5) { edges { node { code } } }
  }
  ... on DiscountAutomaticFreeShipping {
    title status startsAt endsAt
  }
`;

const QUERY = `
  query($first: Int!, $after: String) {
    discountNodes(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          discount { ${DISCOUNT_FIELDS} }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const total = await paginateAll(
  QUERY,
  (data: any) => data.discountNodes,
  async (nodes, pageNum) => {
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} discounts`);
  },
  25
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
