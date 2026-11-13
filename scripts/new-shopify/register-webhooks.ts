// Registers the same 7 order/fulfillment/refund webhooks the legacy store has, on the NEW store,
// pointing at the live site's single webhook endpoint (which tells the stores apart by the
// X-Shopify-Shop-Domain header; see app/api/webhooks/shopify/route.ts).
//
// SWITCH-OVER DAY ONLY: run this after the site is deployed with NEW_SHOPIFY_CLIENT_SECRET set,
// otherwise the site rejects the new store's signatures. Idempotent (skips existing topics).
//
// Usage: npx tsx scripts/new-shopify/register-webhooks.ts [https://www.jawhara.se]
import { newShopifyGraphQL as gql } from "./client.ts";

// www, not the apex: jawhara.se redirects to www and Shopify does not follow redirects for webhooks.
const uri = `${process.argv[2] ?? "https://www.jawhara.se"}/api/webhooks/shopify`;
const TOPICS = ["ORDERS_CREATE", "ORDERS_PAID", "ORDERS_UPDATED", "ORDERS_CANCELLED", "FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE", "REFUNDS_CREATE"];

const existing = await gql(`{ webhookSubscriptions(first:50){ nodes { id topic uri } } }`);
const have = new Set(existing.webhookSubscriptions.nodes.filter((n: any) => n.uri === uri).map((n: any) => n.topic));
let failed = 0;
for (const topic of TOPICS) {
  if (have.has(topic)) { console.log(`exists  ${topic}`); continue; }
  const r = await gql(`mutation($t:WebhookSubscriptionTopic!,$s:WebhookSubscriptionInput!){ webhookSubscriptionCreate(topic:$t, webhookSubscription:$s){ webhookSubscription { id } userErrors { field message } } }`,
    { t: topic, s: { uri, format: "JSON" } });
  if (r.webhookSubscriptionCreate.userErrors.length) { failed++; console.error(`FAILED  ${topic}: ${JSON.stringify(r.webhookSubscriptionCreate.userErrors)}`); }
  else console.log(`created ${topic}`);
}
if (failed) process.exitCode = 1;
