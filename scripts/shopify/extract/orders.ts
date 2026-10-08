import { paginateAll } from "../client.ts";
import { appendJsonl, isDone, markDone, resetResource } from "./util.ts";

const RESOURCE = "orders";

if (isDone(RESOURCE)) {
  console.log(`✓ ${RESOURCE} already extracted (delete data/exports/${RESOURCE}.done to re-run)`);
  process.exit(0);
}

resetResource(RESOURCE);

const QUERY = `
  query($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          name
          email
          phone
          createdAt
          updatedAt
          processedAt
          cancelledAt
          cancelReason
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          confirmed
          test
          note
          tags
          customer { id }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          shippingAddress { firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone }
          billingAddress { firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 phone }
          shippingLine { title code originalPriceSet { shopMoney { amount currencyCode } } }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                sku
                variant { id }
                product { id }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                discountedUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
          }
          discountApplications(first: 10) {
            edges { node { __typename ... on DiscountCodeApplication { code } } }
          }
          fulfillments(first: 10) {
            id
            status
            createdAt
            trackingInfo { number url company }
          }
          transactions(first: 10) {
            id
            kind
            status
            gateway
            amountSet { shopMoney { amount currencyCode } }
            processedAt
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`;

const total = await paginateAll(
  QUERY,
  (data: any) => data.orders,
  async (nodes, pageNum) => {
    appendJsonl(RESOURCE, nodes);
    console.log(`  page ${pageNum}: +${nodes.length} orders`);
  },
  25
);

markDone(RESOURCE, total);
console.log(`✓ ${RESOURCE}: ${total} records -> data/exports/${RESOURCE}.jsonl`);
