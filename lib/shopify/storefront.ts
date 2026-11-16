import { ProxyAgent, setGlobalDispatcher } from "undici";
import { activeStore, storeConfig } from "./stores";

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

// Always the ACTIVE store (lib/shopify/stores.ts): the cart and checkout live in one store at a
// time. With SHOPIFY_ACTIVE_STORE unset these read exactly the env vars they always did.
function getDomain(): string {
  const store = activeStore();
  const domain = storeConfig(store).storefrontDomain;
  if (!domain) throw new StorefrontConfigError(store === "new" ? "Missing NEW_SHOPIFY_STORE_DOMAIN." : "Missing SHOPIFY_STORE_DOMAIN.");
  return domain;
}

function getToken(): string {
  const store = activeStore();
  const token = storeConfig(store).storefrontToken;
  if (!token) throw new StorefrontConfigError(store === "new" ? "Missing NEW_SHOPIFY_STOREFRONT_ACCESS_TOKEN." : "Missing SHOPIFY_STOREFRONT_ACCESS_TOKEN.");
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
  // Line-level attributes (e.g. the gift line's chosen piece, lib/shopify/gift-line.ts).
  attributes: { key: string; value: string }[];
};

export type StorefrontCart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { totalAmount: { amount: string; currencyCode: string }; subtotalAmount: { amount: string; currencyCode: string } };
  lines: StorefrontCartLine[];
  // Phase 4: which discount code(s), if any, Shopify currently has on this cart, and whether each
  // one actually applies to its current contents -- `applicable: false` is how a dead/invalid/
  // out-of-scope code shows up (Shopify never errors the mutation itself for that).
  discountCodes: { code: string; applicable: boolean }[];
  // Cart-level custom attributes. They carry over to the Shopify order as customAttributes and are
  // visible to the checkout's custom web pixel as checkout.attributes. Keys starting with "_" are
  // hidden from the customer. Used for Meta tracking: see lib/marketing/cart-tracking-attributes.ts.
  attributes: { key: string; value: string }[];
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
  discountCodes { code applicable }
  attributes { key value }
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        attributes { key value }
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
    discountCodes: (raw.discountCodes ?? []).map((d: any) => ({ code: d.code, applicable: d.applicable })),
    attributes: (raw.attributes ?? []).map((a: any) => ({ key: a.key, value: a.value ?? "" })),
    lines: (raw.lines?.edges ?? []).map((e: any) => ({
      id: e.node.id,
      quantity: e.node.quantity,
      merchandiseId: e.node.merchandise?.id,
      attributes: (e.node.attributes ?? []).map((a: any) => ({ key: a.key, value: a.value ?? "" })),
    })),
  };
}

export type CartLineInput = { merchandiseId: string; quantity: number; attributes?: { key: string; value: string }[] };

/** `extras` lets the cart be created with its discount code and attributes in the SAME call
 * (lib/shopify/cart-sync.ts's one-call path) instead of separate follow-up mutations. */
export async function cartCreate(
  lines: CartLineInput[],
  extras: { discountCodes?: string[]; attributes?: { key: string; value: string }[] } = {}
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const input: Record<string, unknown> = { lines };
  if (extras.discountCodes?.length) input.discountCodes = extras.discountCodes;
  if (extras.attributes?.length) input.attributes = extras.attributes;
  const data = await storefrontGraphQL<any>(
    `mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { input }
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

/** Sets the cart's discount code(s) to exactly this list (replaces whatever was there, same
 * "full state, not a delta" contract as the cart line mutations) -- an empty array clears any
 * code. Never errors just because a code is invalid/expired/ineligible: Shopify accepts the call
 * and reports that via the returned cart's discountCodes[].applicable instead (see StorefrontCart
 * above), which lib/shopify/cart-sync.ts surfaces as a warning rather than a failed sync. */
export async function cartDiscountCodesUpdate(
  cartId: string,
  discountCodes: string[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
      cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { cartId, discountCodes }
  );
  return { cart: toCart(data.cartDiscountCodesUpdate.cart), userErrors: data.cartDiscountCodesUpdate.userErrors ?? [] };
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

/** Replaces the cart's custom attributes with exactly this list (Shopify's own contract for this
 * mutation -- any attribute not in the list is removed). */
export async function cartAttributesUpdate(
  cartId: string,
  attributes: { key: string; value: string }[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }> {
  const data = await storefrontGraphQL<any>(
    `mutation CartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
      cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
        cart { ${CART_FIELDS} }
        userErrors { field message }
      }
    }`,
    { cartId, attributes }
  );
  return { cart: toCart(data.cartAttributesUpdate.cart), userErrors: data.cartAttributesUpdate.userErrors ?? [] };
}

export type CartBatchOp =
  | { kind: "linesRemove"; lineIds: string[] }
  | { kind: "linesAdd"; lines: CartLineInput[] }
  | { kind: "discountCodesUpdate"; discountCodes: string[] }
  | { kind: "attributesUpdate"; attributes: { key: string; value: string }[] };

/**
 * Runs several cart mutations in ONE Storefront API request: one GraphQL document with one aliased
 * mutation field per op. GraphQL executes top-level mutation fields one after another, in document
 * order, so this applies exactly the same mutations in the same order as calling cartLinesRemove,
 * cartLinesAdd, cartDiscountCodesUpdate and cartAttributesUpdate one by one -- in a single round
 * trip instead of up to four. Results come back per op, in op order.
 */
export async function cartBatch(
  cartId: string,
  ops: CartBatchOp[]
): Promise<{ cart: StorefrontCart | null; userErrors: CartUserError[] }[]> {
  const varDefs = ["$cartId: ID!"];
  const fields: string[] = [];
  const variables: Record<string, unknown> = { cartId };
  ops.forEach((op, i) => {
    const out = `{ cart { ${CART_FIELDS} } userErrors { field message } }`;
    if (op.kind === "linesRemove") {
      varDefs.push(`$v${i}: [ID!]!`);
      fields.push(`op${i}: cartLinesRemove(cartId: $cartId, lineIds: $v${i}) ${out}`);
      variables[`v${i}`] = op.lineIds;
    } else if (op.kind === "linesAdd") {
      varDefs.push(`$v${i}: [CartLineInput!]!`);
      fields.push(`op${i}: cartLinesAdd(cartId: $cartId, lines: $v${i}) ${out}`);
      variables[`v${i}`] = op.lines;
    } else if (op.kind === "discountCodesUpdate") {
      varDefs.push(`$v${i}: [String!]!`);
      fields.push(`op${i}: cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $v${i}) ${out}`);
      variables[`v${i}`] = op.discountCodes;
    } else {
      varDefs.push(`$v${i}: [AttributeInput!]!`);
      fields.push(`op${i}: cartAttributesUpdate(cartId: $cartId, attributes: $v${i}) ${out}`);
      variables[`v${i}`] = op.attributes;
    }
  });
  const data = await storefrontGraphQL<any>(`mutation CartBatch(${varDefs.join(", ")}) { ${fields.join("\n")} }`, variables);
  return ops.map((_, i) => ({ cart: toCart(data[`op${i}`]?.cart), userErrors: data[`op${i}`]?.userErrors ?? [] }));
}
