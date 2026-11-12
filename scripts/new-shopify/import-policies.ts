// Copy the live store's legal policies (verbatim) into the NEW store. Reads the live store, writes
// only to NEW_SHOPIFY_STORE_DOMAIN. Idempotent.
import { shopifyGraphQL } from "../../lib/shopify/client.ts";
import { newShopifyGraphQL } from "./client.ts";
const o = await shopifyGraphQL<any>(`{ shop { shopPolicies { type body } } }`);
let failed = 0;
for (const p of o.shop.shopPolicies) {
  const r = await newShopifyGraphQL(`mutation($p:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$p){ shopPolicy { type } userErrors { field message } } }`, { p: { type: p.type, body: p.body } });
  if (r.shopPolicyUpdate.userErrors.length) { failed++; console.error(p.type, JSON.stringify(r.shopPolicyUpdate.userErrors)); }
  else console.log("copied", p.type);
}
const n = await newShopifyGraphQL(`{ shop { shopPolicies { type body } } }`);
const same = o.shop.shopPolicies.every((p: any) => n.shop.shopPolicies.find((q: any) => q.type === p.type)?.body === p.body);
console.log(same ? "All policies identical to the live store." : "MISMATCH after copy");
if (failed || !same) process.exitCode = 1;
