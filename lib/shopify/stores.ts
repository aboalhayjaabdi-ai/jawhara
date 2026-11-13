if (typeof window !== "undefined") {
  throw new Error("lib/shopify/stores.ts must never be imported into client code");
}

// Two-store support for the Shopify switch-over.
//
//   legacy: the store jawhara.se has always used (SHOPIFY_* env vars, shopify_* id columns).
//   new:    the store being switched to (NEW_SHOPIFY_* env vars, new_shopify_* id columns).
//
// SHOPIFY_ACTIVE_STORE picks which one the cart/checkout, discount sync and manual invoices use.
// Anything other than exactly "new" means legacy, so with the variable unset the site behaves
// exactly as before this file existed and never reads a new_shopify_* column.
//
// Orders are different: an order belongs to the store it was placed in, for its whole life (fulfil,
// track, refund). Order sync and fulfillment therefore work against BOTH stores whenever both are
// configured, and find an order's store by asking which store knows its id (Shopify ids are global,
// so an id only ever resolves in the store that owns it).

export type StoreKey = "legacy" | "new";

export type StoreConfig = {
  key: StoreKey;
  domain: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
  storefrontDomain: string | undefined;
  storefrontToken: string | undefined;
};

export function activeStore(): StoreKey {
  return process.env.SHOPIFY_ACTIVE_STORE === "new" ? "new" : "legacy";
}

export function storeConfig(key: StoreKey): StoreConfig {
  if (key === "new") {
    return {
      key,
      domain: process.env.NEW_SHOPIFY_STORE_DOMAIN,
      clientId: process.env.NEW_SHOPIFY_CLIENT_ID,
      clientSecret: process.env.NEW_SHOPIFY_CLIENT_SECRET,
      storefrontDomain: process.env.NEW_SHOPIFY_STOREFRONT_DOMAIN ?? process.env.NEW_SHOPIFY_STORE_DOMAIN,
      storefrontToken: process.env.NEW_SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    };
  }
  return {
    key,
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    storefrontDomain: process.env.SHOPIFY_STOREFRONT_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN,
    storefrontToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
  };
}

/** Admin API credentials present (domain + client id + secret). */
export function isStoreConfigured(key: StoreKey): boolean {
  const c = storeConfig(key);
  return !!(c.domain && c.clientId && c.clientSecret);
}

/**
 * Stores that hold orders this site must keep in sync, active store first. While legacy is active
 * this is just ["legacy"] (exactly today's behaviour). Once "new" is active, the legacy store stays
 * in the list as long as its credentials are configured, so orders placed before the switch can
 * still be synced, fulfilled and tracked there.
 */
export function orderStores(): StoreKey[] {
  if (activeStore() === "legacy") return ["legacy"];
  return isStoreConfigured("legacy") ? ["new", "legacy"] : ["new"];
}

/** Which configured store a webhook came from, by its X-Shopify-Shop-Domain header. */
export function storeForShopDomain(shopDomain: string | null): StoreKey | null {
  if (!shopDomain) return null;
  const d = shopDomain.toLowerCase();
  for (const key of ["legacy", "new"] as StoreKey[]) {
    if (storeConfig(key).domain?.toLowerCase() === d) return key;
  }
  return null;
}

/** Supabase columns holding each store's own Shopify ids for the shared catalog. */
export const ID_COLUMNS = {
  legacy: { product: "shopify_product_id", variant: "shopify_variant_id", discount: "shopify_discount_id" },
  new: { product: "new_shopify_product_id", variant: "new_shopify_variant_id", discount: "new_shopify_discount_id" },
} as const satisfies Record<StoreKey, { product: string; variant: string; discount: string }>;
