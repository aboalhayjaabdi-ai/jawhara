import { NextRequest, NextResponse } from "next/server";
import { storefrontGraphQL } from "@/lib/shopify/storefront";

/**
 * Temporary maintenance endpoint (to be removed once used): builds a throwaway Shopify cart with
 * the given variant, a Swedish delivery address and the "Express Frakt" option selected -- the
 * state a cart is left in after a customer picked Express in Shopify's checkout and came back.
 * Returns its id so the site's own /api/shopify-cart/sync can be tested against it.
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const created: any = await storefrontGraphQL(
      `mutation($input: CartInput!) { cartCreate(input: $input) { cart { id
         deliveryGroups(first: 5) { nodes { id deliveryOptions { handle title estimatedCost { amount } } } } } userErrors { message } } }`,
      {
        input: {
          lines: [{ merchandiseId: body.variant, quantity: 1 }],
          buyerIdentity: {
            countryCode: "SE",
            deliveryAddressPreferences: [{ deliveryAddress: { address1: "Drottninggatan 1", city: "Stockholm", zip: "11151", country: "SE", firstName: "Test", lastName: "Testsson" } }],
          },
        },
      }
    );
    const cart = created.cartCreate.cart;
    const group = cart.deliveryGroups.nodes[0];
    const express = group?.deliveryOptions.find((o: any) => /express/i.test(o.title));
    const selected: any = express
      ? await storefrontGraphQL(
          `mutation($id: ID!, $sel: [CartSelectedDeliveryOptionInput!]!) { cartSelectedDeliveryOptionsUpdate(cartId: $id, selectedDeliveryOptions: $sel) {
             cart { cost { totalAmount { amount } subtotalAmount { amount } } deliveryGroups(first: 5) { nodes { selectedDeliveryOption { title estimatedCost { amount } } } } } userErrors { message } } }`,
          { id: cart.id, sel: [{ deliveryGroupId: group.id, deliveryOptionHandle: express.handle }] }
        )
      : null;
    return NextResponse.json({ cartId: cart.id, options: group?.deliveryOptions, selected });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message });
  }
}
