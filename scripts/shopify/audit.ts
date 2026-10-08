import { mkdirSync, writeFileSync } from "node:fs";
import { shopifyGraphQL, STORE } from "./client.ts";

type CheckResult = { ok: true; data: unknown } | { ok: false; error: string };

const results: Record<string, CheckResult> = {};

async function check(name: string, query: string, variables?: Record<string, unknown>) {
  try {
    const data = await shopifyGraphQL(query, variables);
    results[name] = { ok: true, data };
    console.log(`✓ ${name}`);
  } catch (err) {
    results[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    console.log(`✗ ${name}: ${results[name].ok === false ? results[name].error : ""}`);
  }
}

await check(
  "shop",
  `{ shop { name myshopifyDomain plan { displayName } currencyCode ianaTimezone primaryDomain { host } weightUnit } }`
);

await check("productsCount", `{ productsCount { count precision } }`);
await check(
  "products_sample",
  `{ products(first: 5) { edges { node { id title handle status productType vendor createdAt updatedAt variants(first: 5) { edges { node { id title price sku inventoryQuantity } } } images(first: 3) { edges { node { id url } } } } } pageInfo { hasNextPage } } }`
);

await check("collectionsCount", `{ collectionsCount { count precision } }`);
await check(
  "collections_sample",
  `{ collections(first: 10) { edges { node { id title handle productsCount { count } sortOrder } } pageInfo { hasNextPage } } }`
);

await check("customersCount", `{ customersCount { count precision } }`);
await check(
  "customers_sample",
  `{ customers(first: 5) { edges { node { id numberOfOrders createdAt updatedAt state } } pageInfo { hasNextPage } } }`
);

await check("ordersCount", `{ ordersCount { count precision } }`);
await check(
  "orders_sample",
  `{ orders(first: 5, sortKey: CREATED_AT, reverse: true) { edges { node { id name createdAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } } } pageInfo { hasNextPage } } }`
);

await check(
  "discounts_sample",
  `{ discountNodes(first: 10) { edges { node { id discount { __typename ... on DiscountCodeBasic { title status } ... on DiscountAutomaticBasic { title status } } } } pageInfo { hasNextPage } } }`
);

await check(
  "pages_sample",
  `{ pages(first: 10) { edges { node { id title handle } } pageInfo { hasNextPage } } }`
);

await check(
  "blogs_sample",
  `{ blogs(first: 10) { edges { node { id title handle articles(first: 3) { edges { node { id title } } } } } pageInfo { hasNextPage } } }`
);

await check(
  "menus_sample",
  `{ menus(first: 10) { edges { node { id title handle items { id title } } } pageInfo { hasNextPage } } }`
);

await check(
  "themes",
  `{ themes(first: 10) { edges { node { id name role createdAt updatedAt } } pageInfo { hasNextPage } } }`
);

await check(
  "locations",
  `{ locations(first: 10) { edges { node { id name isActive address { city countryCode } } } pageInfo { hasNextPage } } }`
);

await check(
  "metaobject_definitions",
  `{ metaobjectDefinitions(first: 20) { edges { node { id name type fieldDefinitions { name key } } } pageInfo { hasNextPage } } }`
);

await check(
  "markets",
  `{ markets(first: 10) { edges { node { id name handle enabled } } pageInfo { hasNextPage } } }`
);

mkdirSync("data/exports", { recursive: true });
writeFileSync("data/exports/audit-raw.json", JSON.stringify({ store: STORE.domain, ranAt: new Date().toISOString(), results }, null, 2));

console.log("\nAudit raw output written to data/exports/audit-raw.json");
