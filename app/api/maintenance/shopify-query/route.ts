import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";

/**
 * Temporary maintenance endpoint (to be removed once used): runs one Admin GraphQL operation
 * against the new Shopify store through the app's own Shopify connection. Mutations only with
 * { "allowMutation": true }. Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === "string" ? body.query : "";
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
  if (/^\s*mutation\b/i.test(query) && body?.allowMutation !== true) {
    return NextResponse.json({ error: "mutation not allowed without allowMutation" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await shopifyGraphQL<unknown>(query, body?.variables ?? {}, body?.store === "legacy" ? "legacy" : "new") });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 200 });
  }
}
