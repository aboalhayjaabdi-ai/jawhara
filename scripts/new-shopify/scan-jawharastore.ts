// READ-ONLY: scans the NEW store (shop fields, policies, products, collections, discounts) for "jawharastore".
import { newShopifyGraphQL as gql } from "./client.ts";
const re = /jawhara\s*store/gi;
const hits: string[] = [];
const scan = (where: string, v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v ?? ""); const m = s.match(re); if (m) hits.push(`${where}: ${m.length}x  …${s.slice(Math.max(0, s.search(re) - 50), s.search(re) + 60).replace(/\s+/g, " ")}…`); };
const shop = await gql(`{ shop { name email contactEmail description shopPolicies { type body } } }`);
scan("shop fields", { ...shop.shop, shopPolicies: undefined });
for (const p of shop.shop.shopPolicies) scan(`policy ${p.type}`, p.body);
let after: string | null = null, n = 0;
for (;;) { const d = await gql(`query($a:String){ products(first:100, after:$a){ nodes { handle title descriptionHtml vendor tags seo { title description } variants(first:250){ nodes { title sku } } } pageInfo { hasNextPage endCursor } } }`, { a: after });
  for (const p of d.products.nodes) { n++; scan(`product ${p.handle}`, p); }
  if (!d.products.pageInfo.hasNextPage) break; after = d.products.pageInfo.endCursor; }
const c = await gql(`{ collections(first:100){ nodes { handle title descriptionHtml seo { title description } } } discountNodes(first:50){ nodes { discount { ... on DiscountAutomaticBxgy { title } ... on DiscountCodeBasic { title codes(first:5){ nodes { code } } } } } } }`);
for (const x of c.collections.nodes) scan(`collection ${x.handle}`, x);
for (const x of c.discountNodes.nodes) scan(`discount`, x);
console.log(`scanned ${n} products, ${c.collections.nodes.length} collections, ${c.discountNodes.nodes.length} discounts, 5 policies, shop fields`);
console.log(hits.length ? hits.join("\n") : "no occurrences");
