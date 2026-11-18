import { NextRequest, NextResponse } from "next/server";
import { storeConfig, type StoreKey } from "@/lib/shopify/stores";

/**
 * Temporary maintenance endpoint (to be removed once used): creates a throwaway Storefront cart in
 * the given store ("legacy" or "new") with the given variants and returns what Shopify says about
 * it (lines, costs, delivery options for a Swedish address, warnings). Lets a store be checked
 * before the site's checkout is switched to it. Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const store: StoreKey = body?.store === "legacy" ? "legacy" : "new";
  const cfg = storeConfig(store);
  const variants: string[] = Array.isArray(body?.variants) ? body.variants : [];
  const query = `mutation($input: CartInput!) { cartCreate(input: $input) {
    cart { id checkoutUrl totalQuantity
      lines(first: 50) { nodes { quantity merchandise { ... on ProductVariant { id product { handle } } } } }
      cost { subtotalAmount { amount } totalAmount { amount } }
      discountAllocations { discountedAmount { amount } ... on CartAutomaticDiscountAllocation { title } }
      deliveryGroups(first: 10) { nodes { cartLines(first: 50) { nodes { merchandise { ... on ProductVariant { product { handle } } } } } deliveryOptions { title description estimatedCost { amount } } } } }
    userErrors { field message code } warnings { code message } } }`;
  const lines = new Map<string, number>();
  for (const v of variants) lines.set(v, (lines.get(v) ?? 0) + 1);
  try {
    const res = await fetch(`https://${cfg.storefrontDomain}/api/2026-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": cfg.storefrontToken ?? "" },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            lines: [...lines].map(([merchandiseId, quantity]) => ({ merchandiseId, quantity })),
            buyerIdentity: {
              countryCode: "SE",
              ...(body?.withAddress
                ? { deliveryAddressPreferences: [{ deliveryAddress: { address1: "Drottninggatan 1", city: "Stockholm", zip: "11151", country: "SE", firstName: "Test", lastName: "Testsson" } }] }
                : {}),
            },
          },
        },
      }),
    });
    return NextResponse.json({ store, domain: cfg.storefrontDomain, ...(await res.json()) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message });
  }
}
