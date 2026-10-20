import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const STORE_DOMAIN = requireEnv("SHOPIFY_STORE_DOMAIN");
const CLIENT_ID = requireEnv("SHOPIFY_CLIENT_ID");
const CLIENT_SECRET = requireEnv("SHOPIFY_CLIENT_SECRET");
const API_VERSION = "2026-10";
// The site this app actually serves order/fulfillment/email sync from -- defaults to the live
// production domain since that's the only place Shopify can reach from the public internet
// (never localhost/a preview deployment).
const CALLBACK_BASE = process.argv[2] ?? "https://jawhara.se";

async function getAccessToken(): Promise<string> {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Failed to mint Shopify access token: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function graphql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data!;
}

const TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_PAID",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "FULFILLMENTS_CREATE",
  "FULFILLMENTS_UPDATE",
  "REFUNDS_CREATE",
] as const;

const CREATE_MUTATION = `
  mutation($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`;

const EXISTING_QUERY = `
  query {
    webhookSubscriptions(first: 50) {
      edges { node { id topic uri } }
    }
  }
`;

async function main() {
  const token = await getAccessToken();
  const uri = `${CALLBACK_BASE}/api/webhooks/shopify`;
  console.log(`Registering webhooks pointing at ${uri}\n`);

  const existing = await graphql<{ webhookSubscriptions: { edges: { node: { id: string; topic: string; uri: string } }[] } }>(
    token,
    EXISTING_QUERY
  );
  const existingForThisUrl = new Set(
    existing.webhookSubscriptions.edges.filter((e) => e.node.uri === uri).map((e) => e.node.topic)
  );

  for (const topic of TOPICS) {
    if (existingForThisUrl.has(topic)) {
      console.log(`SKIP ${topic}: already registered for this URL`);
      continue;
    }
    const result = await graphql<{
      webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: { field: string[]; message: string }[] };
    }>(token, CREATE_MUTATION, { topic, webhookSubscription: { uri, format: "JSON" } });
    const { webhookSubscription, userErrors } = result.webhookSubscriptionCreate;
    if (userErrors.length) {
      console.log(`FAILED ${topic}: ${userErrors.map((e) => e.message).join(", ")}`);
    } else {
      console.log(`CREATED ${topic}: ${webhookSubscription?.id}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
