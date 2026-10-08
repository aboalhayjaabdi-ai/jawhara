import { paginateAll } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

const RESOURCE = "customers";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

resetResource(RESOURCE);

const QUERY = `
  query($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          firstName
          lastName
          email
          phone
          state
          note
          tags
          numberOfOrders
          amountSpent { amount currencyCode }
          createdAt
          updatedAt
          emailMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt }
          smsMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt }
          defaultAddress { id }
          addresses { id firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone company }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const total = await paginateAll(
  QUERY,
  (data: any) => data.customers,
  async (nodes, pageNum) => {
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} customers`);
  },
  50
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
