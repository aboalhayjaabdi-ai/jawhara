import { NextRequest, NextResponse } from "next/server";
import { storefrontGraphQL } from "@/lib/shopify/storefront";

/**
 * Temporary maintenance endpoint (to be removed once used): creates a throwaway Shopify Storefront
 * cart with the given variants and returns everything Shopify says about it (lines, costs, delivery
 * groups/options for a Swedish address, warnings, errors) -- to see how shipping settings affect it.
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const variants: string[] = Array.isArray(body?.variants) ? body.variants : [];
  try {
    const data = await storefrontGraphQL<unknown>(
      `mutation($input: CartInput!) { cartCreate(input: $input) {
         cart { id totalQuantity
           lines(first: 20) { nodes { quantity merchandise { ... on ProductVariant { id title product { handle } } } cost { totalAmount { amount } } } }
           cost { subtotalAmount { amount } totalAmount { amount } checkoutChargeAmount { amount } totalTaxAmount { amount } }
           deliveryGroups(first: 10, withCarrierRates: true) { nodes { groupType cartLines(first: 20) { nodes { merchandise { ... on ProductVariant { product { handle } } } } }
             deliveryOptions { handle title description deliveryMethodType estimatedCost { amount } } selectedDeliveryOption { title } } }
         }
         userErrors { field message code } warnings { code message } } }`,
      {
        input: {
          lines: variants.map((merchandiseId) => ({ merchandiseId, quantity: 1 })),
          buyerIdentity: {
            countryCode: "SE",
            ...(body?.withAddress
              ? { deliveryAddressPreferences: [{ deliveryAddress: { address1: "Drottninggatan 1", city: "Stockholm", zip: "11151", country: "SE", firstName: "Test", lastName: "Testsson" } }] }
              : {}),
          },
        },
      }
    );
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message });
  }
}
