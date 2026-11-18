import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";

/**
 * Temporary maintenance endpoint (to be removed once used): makes the new Shopify store's policies
 * say only that the customer pays the return shipping (no price), through the app's own Shopify
 * connection. Without { "apply": true } it only reports what it would change.
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
const REPLACEMENTS: [string, string][] = [
  ["Observera att kunden står för returkostnaden på 49 kr, vilken dras av från återbetalningsbeloppet.", "Observera att kunden står för returfrakten."],
  ["Vid retur tar vi ut en returavgift på 49 SEK.", "Kunden står för returfrakten."],
  ["RETURKOSTNAD", "RETURFRAKT"],
];

type Policy = { id: string; type: string; title: string; body: string };

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const data = await shopifyGraphQL<{ shop: { shopPolicies: Policy[] } }>(`{ shop { shopPolicies { id type title body } } }`, {}, "new");
    const report = [];
    for (const p of data.shop.shopPolicies) {
      const found = REPLACEMENTS.filter(([from]) => p.body.includes(from)).map(([from]) => from);
      if (found.length === 0) continue;
      let next = p.body;
      for (const [from, to] of REPLACEMENTS) next = next.split(from).join(to);
      const entry: Record<string, unknown> = { type: p.type, found };
      if (body?.apply === true) {
        const res = await shopifyGraphQL<{ shopPolicyUpdate: { shopPolicy: { body: string } | null; userErrors: { message: string }[] } }>(
          `mutation($p: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $p) { shopPolicy { body } userErrors { message } } }`,
          { p: { type: p.type, body: next } },
          "new"
        );
        entry.errors = res.shopPolicyUpdate.userErrors;
        entry.stillHasPrice = /returkostnaden på 49|returavgift på 49/.test(res.shopPolicyUpdate.shopPolicy?.body ?? "");
      }
      report.push(entry);
    }
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
