import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";

/**
 * Temporary maintenance endpoint (to be removed once used): sets the price of the given variants in
 * the new Shopify store through the app's own Shopify connection, and returns their prices as
 * Shopify has them afterwards. Without { "apply": true } it only reads them.
 * Body: { "variants": ["gid://shopify/ProductVariant/…"], "price": "899.00", "compareAtPrice"?: "1699.00", "apply": true }
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.variants) ? body.variants.filter((v: unknown) => typeof v === "string") : [];
  const price = typeof body?.price === "string" && /^\d+(\.\d{1,2})?$/.test(body.price) ? body.price : null;
  const compareAtPrice =
    typeof body?.compareAtPrice === "string" && /^\d+(\.\d{1,2})?$/.test(body.compareAtPrice) ? body.compareAtPrice : undefined;
  if (ids.length === 0 || ids.length > 20 || !price) return NextResponse.json({ error: "variants (1-20) and price required" }, { status: 400 });

  const read = async () =>
    (
      await shopifyGraphQL<{ nodes: ({ id: string; price: string; compareAtPrice: string | null; product: { id: string; handle: string } } | null)[] }>(
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id price compareAtPrice product { id handle } } } }`,
        { ids },
        "new"
      )
    ).nodes;

  try {
    const before = await read();
    const out: Record<string, unknown> = { before };
    if (body?.apply === true) {
      const byProduct = new Map<string, string[]>();
      for (const v of before) if (v) byProduct.set(v.product.id, [...(byProduct.get(v.product.id) ?? []), v.id]);
      const errors = [];
      for (const [productId, variantIds] of byProduct) {
        const res = await shopifyGraphQL<{ productVariantsBulkUpdate: { userErrors: { field: string[]; message: string }[] } }>(
          `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
             productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`,
          { productId, variants: variantIds.map((id) => ({ id, price, ...(compareAtPrice ? { compareAtPrice } : {}) })) },
          "new"
        );
        errors.push(...res.productVariantsBulkUpdate.userErrors);
      }
      out.errors = errors;
      out.after = await read();
    }
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
