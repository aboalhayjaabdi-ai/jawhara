// Copy the live store's ACTIVE discounts into the NEW store, with identical rules, pointing at the
// new store's own product/collection IDs (matched by handle). Expired/test discounts are skipped.
// Run after import-catalog.ts. Idempotent: an existing discount with the same title is updated.
//
// Source: read-only dump from dump-old-discounts.ts. Writes only to NEW_SHOPIFY_STORE_DOMAIN.
// Usage: npx tsx scripts/new-shopify/import-discounts.ts <old-discounts.json>
import { readFileSync } from "node:fs";
import { newShopifyGraphQL as gql } from "./client.ts";

const src = JSON.parse(readFileSync(process.argv[2], "utf8")) as any[];
const active = src.map((n) => n.discount).filter((d) => d.status === "ACTIVE");

async function idByHandle(kind: "product" | "collection", handle: string): Promise<string> {
  const q = kind === "product" ? `query($h:String!){ productByIdentifier(identifier:{handle:$h}){ id } }` : `query($h:String!){ collectionByIdentifier(identifier:{handle:$h}){ id } }`;
  const d = await gql(q, { h: handle });
  const id = (kind === "product" ? d.productByIdentifier : d.collectionByIdentifier)?.id;
  if (!id) throw new Error(`new store has no ${kind} with handle ${handle}`);
  return id;
}

async function items(i: any) {
  if (i.__typename === "AllDiscountItems") return { all: true };
  if (i.__typename === "DiscountCollections") {
    const ids = [];
    for (const c of i.collections.nodes) ids.push(await idByHandle("collection", c.handle));
    return { collections: { add: ids } };
  }
  if (i.productVariants.nodes.length) throw new Error("variant-scoped discounts not handled");
  const ids = [];
  for (const p of i.products.nodes) ids.push(await idByHandle("product", p.handle));
  return { products: { productsToAdd: ids } };
}

function value(v: any) {
  if (v.__typename === "DiscountPercentage") return { percentage: v.percentage };
  if (v.__typename === "DiscountAmount") return { discountAmount: { amount: v.amount.amount, appliesOnEachItem: v.appliesOnEachItem } };
  if (v.__typename === "DiscountOnQuantity") {
    const e = v.effect;
    return { discountOnQuantity: { quantity: v.quantity.quantity, effect: e.__typename === "DiscountPercentage" ? { percentage: e.percentage } : { amount: e.amount.amount } } };
  }
  throw new Error(`unknown value ${v.__typename}`);
}

const existing = await gql(`{ discountNodes(first:100){ nodes { id discount { __typename ... on DiscountAutomaticBxgy { title } ... on DiscountCodeBasic { title } ... on DiscountAutomaticBasic { title } ... on DiscountCodeBxgy { title } } } } }`);
const existingByTitle = new Map<string, { id: string; type: string }>(existing.discountNodes.nodes.map((n: any) => [n.discount.title, { id: n.id, type: n.discount.__typename }]));

let failed = 0;
for (const d of active) {
  try {
    const ex = existingByTitle.get(d.title);
    let r: any;
    if (d.__typename === "DiscountAutomaticBxgy") {
      const input = {
        title: d.title,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        combinesWith: d.combinesWith,
        usesPerOrderLimit: d.usesPerOrderLimit != null ? String(d.usesPerOrderLimit) : null,
        customerBuys: { value: { quantity: d.customerBuys.value.quantity }, items: await items(d.customerBuys.items) },
        customerGets: { value: value(d.customerGets.value), items: await items(d.customerGets.items) },
      };
      if (ex) {
        // Reset item scopes so an update replaces, not appends.
        r = await gql(`mutation($id:ID!,$d:DiscountAutomaticBxgyInput!){ discountAutomaticBxgyUpdate(id:$id, automaticBxgyDiscount:$d){ userErrors { field message } } }`, { id: ex.id, d: input });
        r = r.discountAutomaticBxgyUpdate;
      } else {
        r = await gql(`mutation($d:DiscountAutomaticBxgyInput!){ discountAutomaticBxgyCreate(automaticBxgyDiscount:$d){ userErrors { field message } } }`, { d: input });
        r = r.discountAutomaticBxgyCreate;
      }
    } else if (d.__typename === "DiscountCodeBasic") {
      if (d.context?.__typename && d.context.__typename !== "DiscountBuyerSelectionAll") throw new Error("customer-specific code not handled");
      const input = {
        title: d.title,
        code: d.codes.nodes[0].code,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        combinesWith: d.combinesWith,
        appliesOncePerCustomer: d.appliesOncePerCustomer,
        usageLimit: d.usageLimit,
        recurringCycleLimit: d.recurringCycleLimit,
        context: { all: "ALL" },
        minimumRequirement: d.minimumRequirement
          ? d.minimumRequirement.__typename === "DiscountMinimumQuantity"
            ? { quantity: { greaterThanOrEqualToQuantity: d.minimumRequirement.greaterThanOrEqualToQuantity } }
            : { subtotal: { greaterThanOrEqualToSubtotal: d.minimumRequirement.greaterThanOrEqualToSubtotal.amount } }
          : null,
        customerGets: {
          value: value(d.customerGets.value),
          items: await items(d.customerGets.items),
          appliesOnOneTimePurchase: d.customerGets.appliesOnOneTimePurchase,
          appliesOnSubscription: d.customerGets.appliesOnSubscription,
        },
      };
      if (ex) {
        r = (await gql(`mutation($id:ID!,$d:DiscountCodeBasicInput!){ discountCodeBasicUpdate(id:$id, basicCodeDiscount:$d){ userErrors { field message } } }`, { id: ex.id, d: input })).discountCodeBasicUpdate;
      } else {
        r = (await gql(`mutation($d:DiscountCodeBasicInput!){ discountCodeBasicCreate(basicCodeDiscount:$d){ userErrors { field message } } }`, { d: input })).discountCodeBasicCreate;
      }
    } else {
      throw new Error(`discount type ${d.__typename} not handled`);
    }
    if (r.userErrors.length) throw new Error(JSON.stringify(r.userErrors));
    console.log(`${ex ? "updated" : "created"}: ${d.title}`);
  } catch (e: any) {
    failed++;
    console.error(`FAILED ${d.title}: ${e.message.slice(0, 600)}`);
  }
}
if (failed) process.exitCode = 1;
