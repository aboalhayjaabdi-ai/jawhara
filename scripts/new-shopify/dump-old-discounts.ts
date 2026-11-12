// READ-ONLY: dumps the live store's discounts (all types) to JSON.
import { writeFileSync } from "node:fs";
import { shopifyGraphQL } from "../../lib/shopify/client.ts";
const ITEMS = `items { __typename ... on AllDiscountItems { allItems } ... on DiscountProducts { products(first:100){ nodes { id handle } } productVariants(first:100){ nodes { id product { handle } selectedOptions { name value } } } } ... on DiscountCollections { collections(first:50){ nodes { id handle } } } }`;
const VALUE = `value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } appliesOnEachItem } ... on DiscountOnQuantity { quantity { quantity } effect { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } appliesOnEachItem } } } }`;
const MIN = `minimumRequirement { __typename ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } }`;
const COMMON = `title status startsAt endsAt discountClasses combinesWith { orderDiscounts productDiscounts shippingDiscounts } asyncUsageCount`;
const d = await shopifyGraphQL<any>(`{ discountNodes(first:25){ nodes { id discount { __typename
  ... on DiscountCodeBasic { ${COMMON} appliesOncePerCustomer usageLimit recurringCycleLimit codes(first:20){ nodes { code } } customerGets { appliesOnOneTimePurchase appliesOnSubscription ${VALUE} ${ITEMS} } ${MIN} context { __typename } }
  ... on DiscountCodeBxgy { ${COMMON} appliesOncePerCustomer usageLimit usesPerOrderLimit codes(first:20){ nodes { code } } customerBuys { value { __typename ... on DiscountQuantity { quantity } ... on DiscountPurchaseAmount { amount } } ${ITEMS} } customerGets { ${VALUE} ${ITEMS} } }
  ... on DiscountCodeFreeShipping { ${COMMON} appliesOncePerCustomer usageLimit codes(first:20){ nodes { code } } }
  ... on DiscountAutomaticBasic { ${COMMON} recurringCycleLimit customerGets { ${VALUE} ${ITEMS} } ${MIN} }
  ... on DiscountAutomaticBxgy { ${COMMON} usesPerOrderLimit customerBuys { value { __typename ... on DiscountQuantity { quantity } ... on DiscountPurchaseAmount { amount } } ${ITEMS} } customerGets { ${VALUE} ${ITEMS} } }
  ... on DiscountAutomaticFreeShipping { ${COMMON} }
  ... on DiscountAutomaticApp { ${COMMON} appDiscountType { functionId title appKey } }
  ... on DiscountCodeApp { ${COMMON} appDiscountType { functionId title appKey } }
} } } }`);
writeFileSync(process.argv[2], JSON.stringify(d.discountNodes.nodes, null, 1));
for (const n of d.discountNodes.nodes) console.log(n.discount.__typename, "|", n.discount.title, "|", n.discount.status, "|", n.discount.codes?.nodes.map((c: any) => c.code).join(",") ?? "", "| used", n.discount.asyncUsageCount);
