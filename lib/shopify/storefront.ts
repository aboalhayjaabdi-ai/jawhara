import { ProxyAgent, setGlobalDispatcher } from "undici";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/storefront.ts must never be imported into client code");
}

// Server-only Shopify Storefront API client for Phase 2's cart sync (lib/shopify/cart-sync.ts).
// Deliberately separate from lib/shopify/client.ts, which talks to the Admin API with the
// private client-credentials token (SHOPIFY_CLIENT_SECRET) -- that token must never be reachable
// from this path. The Storefront API token below is the public, storefront-scoped token Shopify
// designs to be used for exactly this (reading the catalog and managing a buyer's cart); it is
// still kept server-side here, matching every other Shopify/Supabase call in this codebase, so
// the client bundle never needs to know the store domain or API version and every error is
// handled in one place.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const API_VERSION = "2026-10";

export class StorefrontConfigError extends Error {}

function getDomain(): string {
  const domain = process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new StorefrontConfigError("Missing SHOPIFY_STORE_DOMAIN.");
  return domain;
}

function getToken(): string {
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  if (!token) throw new StorefrontConfigError("Missing SHOPIFY_STOREFRONT_ACCESS_TOKEN.");
  return token;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Low-level Storefront GraphQL call. Throws StorefrontConfigError when env vars are missing
 * (caller decides whether that's fatal) and a plain Error for any other transport/API failure --
 * callers in lib/shopify/cart-sync.ts always catch these and degrade to a warning rather than
 * letting a Shopify hiccup break the real (Supabase-backed) Jawhara cart.
 */
export async function storefrontGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const domain = getDomain();
  const token = getToken();

  const res = await fetch(`https://${domain}/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok && res.status !== 400) {
    throw new Error(`Shopify Storefront API HTTP ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) throw new Error(`Shopify Storefront API error: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error(`Shopify Storefront API returned no data: ${JSON.stringify(json)}`);
  return json.data;
}

export type StorefrontCartLine = {
  id: string;
  quantity: number;
  merchandiseId: string;
};

export type StorefrontCart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { totalAmount: { amount: string; currencyCode: string }; subtotalAmount: { amount: string; currencyCode: string } };
  lines: StorefrontCartLine[];
};

export type CartUserError = { field: string[] | null; message: string; code?: string | null };

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    totalAmount { amount currencyCode }
    subtotalAmount { amount currencyCode }
  }
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
          }
        }
      }
    }
  }
`;

function toCart(raw: any): StorefrontCart | null {
  if (!raw) return null;
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    cost: raw.cost,
    lines: (raw.lines?.edges ?? []).map((e: any) => ({
      id: e.node.id,
      quantity: e.node.quantity,
      merchandiseId: e.node.merchandise?.id,
    })),
  };
}

export type CartLineInput = { merchandiseId: string; quantity: number };

export async function cartCreate(
  lines: CartLineInput[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { input: { lines } }
  );
  return { cart: toCart(data.cartCreate.cart), userErrors: data.cartCreate.userErrors ?? [] };
}

export async function cartGet(cartId: string): Promise<StorefrontCart | null> {
  const data = await storefrontGraphQL<any>(
    `query CartGet($id: ID!) {
      cart(id: $id) { ${CART_FIELDS} }
    }`,
    { id: cartId }
  );
  return toCart(data.cart);
}

export async function cartLinesAdd(
  cartId: string,
  lines: CartLineInput[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { cartId, lines }
  );
  return { cart: toCart(data.cartLinesAdd.cart), userErrors: data.cartLinesAdd.userErrors ?? [] };
}

export async function cartLinesUpdate(
  cartId: string,
  lines: { id: string; quantity: number }[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { cartId, lines }
  );
  return { cart: toCart(data.cartLinesUpdate.cart), userErrors: data.cartLinesUpdate.userErrors ?? [] };
}

export async function cartLinesRemove(
  cartId: string,
  lineIds: string[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { cartId, lineIds }
  );
  return { cart: toCart(data.cartLinesRemove.cart), userErrors: data.cartLinesRemove.userErrors ?? [] };
}
