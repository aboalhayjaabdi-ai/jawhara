// Copy the live store's legal policies into the NEW store. Reads the live store, writes only to
// NEW_SHOPIFY_STORE_DOMAIN. Idempotent.
//
// The new store uses support@jawharashop.se / jawharashop.se, so every "jawharastore" (email
// addresses and policy links) is rewritten to "jawharashop". Nothing else in the text changes.
import { shopifyGraphQL } from "../../lib/shopify/client.ts";
import { newShopifyGraphQL } from "./client.ts";

export const rewrite = (body: string) => body.replace(/jawharastore/gi, "jawharashop");

const o = await shopifyGraphQL<any>(`{ shop { shopPolicies { type body } } }`);
let failed = 0;
for (const p of o.shop.shopPolicies) {
  const r = await newShopifyGraphQL(`mutation($p:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$p){ shopPolicy { type } userErrors { field message } } }`, { p: { type: p.type, body: rewrite(p.body) } });
  if (r.shopPolicyUpdate.userErrors.length) { failed++; console.error(p.type, JSON.stringify(r.shopPolicyUpdate.userErrors)); }
  else console.log("copied", p.type);
}
const n = await newShopifyGraphQL(`{ shop { shopPolicies { type body } } }`);
const same = o.shop.shopPolicies.every((p: any) => n.shop.shopPolicies.find((q: any) => q.type === p.type)?.body === rewrite(p.body));
const leftover = n.shop.shopPolicies.filter((q: any) => /jawhara\s*store/i.test(q.body)).map((q: any) => q.type);
console.log(same ? "All policies identical to the live store, with jawharastore -> jawharashop." : "MISMATCH after copy");
console.log(leftover.length ? `"jawharastore" still in: ${leftover.join(", ")}` : `No "jawharastore" left in any policy.`);
if (failed || !same || leftover.length) process.exitCode = 1;
