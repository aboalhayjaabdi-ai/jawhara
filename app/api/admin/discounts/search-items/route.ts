import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

/**
 * Product search for the discount-eligibility item picker. Discounts match eligibility by
 * `shopify_id` (lib/discounts.ts's qualifies(), unchanged by this phase) -- a manually-created
 * product has no shopify_id at all, so it structurally can never be matched by any discount's
 * buy/get rule. Only Shopify-origin products are returned here; the picker UI explains why a
 * manual product can't be picked, rather than silently offering a selection that would never
 * actually apply at checkout.
 */
export async function GET(request: Request) {
  await requireAdmin();

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  const supabase = await createAuthServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, title, shopify_id")
    .ilike("title", `%${q}%`)
    .not("shopify_id", "is", null)
    .limit(10);

  return NextResponse.json({ items: (products ?? []).map((p) => ({ shopifyId: p.shopify_id as string, title: p.title })) });
}
