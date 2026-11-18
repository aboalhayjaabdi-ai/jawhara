import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";

/**
 * Temporary, read-only maintenance endpoint (to be removed once used): the new Shopify store's
 * delivery profiles -- zones, shipping methods, their prices and conditions -- read through the
 * app's own Shopify connection. Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const d = await shopifyGraphQL<any>(
      `{ deliveryProfiles(first: 10) { nodes { id name default
           profileLocationGroups { locationGroup { id }
             locationGroupZones(first: 20) { nodes {
               zone { id name countries { code { countryCode } } }
               methodDefinitions(first: 30) { nodes {
                 id name description active
                 rateProvider {
                   __typename
                   ... on DeliveryRateDefinition { id price { amount currencyCode } }
                   ... on DeliveryParticipant { id }
                 }
                 methodConditions { id field operator
                   conditionCriteria { __typename ... on MoneyV2 { amount currencyCode } ... on Weight { unit value } } }
               } }
             } }
           }
         } } }`,
      {},
      "new"
    );
    return NextResponse.json(d);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
