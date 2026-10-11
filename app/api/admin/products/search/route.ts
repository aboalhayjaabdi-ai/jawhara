import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

// Product+variant search for the manual order form (components/admin/manual-order-form.tsx) --
// a separate, variant-including query from /api/admin/search's lighter product results, which
// only returns id/title/handle/status and isn't enough to pick a specific priced variant to sell.
export async function GET(request: Request) {
  await requireAdmin();

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const supabase = await createAuthServerClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, title, product_variants(id, title, sku, price, compare_at_price)")
    .ilike("title", `%${q}%`)
    .eq("status", "active")
    .limit(8);

  return NextResponse.json({ products: products ?? [] });
}
