import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";

/**
 * Temporary maintenance endpoint (to be removed once used): reads the new Shopify store's legal
 * policies and shipping method names, and -- with { "apply": true } -- replaces the old delivery
 * time sentence in its policies with the current one, through the app's own Shopify connection.
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
const OLD = "Hanteringstiden är 2–5 arbetsdagar och leveranstiden är 5–10 arbetsdagar.";
const NEW = "Hanteringstiden innan beställningen skickas är 2–5 arbetsdagar. Leveranstiden därefter är normalt 5–15 arbetsdagar.";
const DELIVERY_TEXT = /[^.<>]{0,120}(leveranstid|arbetsdag|vardag|hanteringstid)[^.<>]{0,120}/gi;

type Policy = { id: string; type: string; title: string; body: string };

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const out: Record<string, unknown> = {};

  try {
    const data = await shopifyGraphQL<{ shop: { shopPolicies: Policy[] } }>(
      `{ shop { shopPolicies { id type title body } } }`,
      {},
      "new"
    );
    const policies = data.shop.shopPolicies;
    out.policies = policies.map((p) => ({ type: p.type, title: p.title, deliveryText: p.body.match(DELIVERY_TEXT) ?? [], hasOld: p.body.includes(OLD) }));

    if (body?.apply === true) {
      const updated = [];
      for (const p of policies.filter((p) => p.body.includes(OLD))) {
        const res = await shopifyGraphQL<{ shopPolicyUpdate: { shopPolicy: { type: string; body: string } | null; userErrors: { field: string[]; message: string }[] } }>(
          `mutation($p: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $p) { shopPolicy { type body } userErrors { field message } } }`,
          { p: { type: p.type, body: p.body.split(OLD).join(NEW) } },
          "new"
        );
        updated.push({
          type: p.type,
          errors: res.shopPolicyUpdate.userErrors,
          nowHasNew: res.shopPolicyUpdate.shopPolicy?.body.includes(NEW) ?? false,
          nowHasOld: res.shopPolicyUpdate.shopPolicy?.body.includes(OLD) ?? null,
        });
      }
      out.updated = updated;
    }
  } catch (err) {
    out.policyError = (err as Error).message;
  }

  try {
    const d = await shopifyGraphQL<any>(
      `{ deliveryProfiles(first: 10) { edges { node { name profileLocationGroups { locationGroupZones(first: 20) { edges { node { zone { name } methodDefinitions(first: 20) { edges { node { name description active } } } } } } } } } } }`,
      {},
      "new"
    );
    out.shippingMethods = d.deliveryProfiles.edges.flatMap((p: any) =>
      p.node.profileLocationGroups.flatMap((g: any) =>
        g.locationGroupZones.edges.flatMap((z: any) =>
          z.node.methodDefinitions.edges.map((m: any) => ({ profile: p.node.name, zone: z.node.zone.name, ...m.node }))
        )
      )
    );
  } catch (err) {
    out.shippingError = (err as Error).message;
  }

  return NextResponse.json(out);
}
