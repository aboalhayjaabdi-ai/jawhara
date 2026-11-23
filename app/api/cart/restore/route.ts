import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getProductCardsByIds } from "@/lib/queries";
import { normalizeVariantTitle } from "@/lib/variant-title";

// Read-only: turns a saved cart (variant ids + quantities, e.g. from an abandoned-cart e-mail link)
// back into cart lines with today's title, price and image. Prices are only for display -- the
// cart is priced by /api/cart/totals and the Shopify cart sync like any other cart. Inactive or
// unavailable variants are left out.
const MAX_LINES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const lines = (Array.isArray(body?.lines) ? body.lines : [])
    .filter((l: any) => typeof l?.variantId === "string" && UUID.test(l.variantId))
    .slice(0, MAX_LINES)
    .map((l: any) => ({ variantId: l.variantId as string, qty: Math.min(10, Math.max(1, Math.floor(Number(l.qty) || 1))) }));
  if (lines.length === 0) return NextResponse.json({ items: [] });
  try {
    const { data: variants } = await supabase.from("product_variants").select("id, product_id").in("id", lines.map((l: { variantId: string }) => l.variantId));
    const productOf = new Map((variants ?? []).map((v: any) => [v.id as string, v.product_id as string]));
    const cards = await getProductCardsByIds([...new Set([...productOf.values()])]);
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const items = [];
    for (const l of lines) {
      const card = cardById.get(productOf.get(l.variantId) ?? "");
      const v = card?.variants.find((x) => x.id === l.variantId);
      if (!card || !v || !v.available) continue;
      const label = [v.option1, v.option2, v.option3].filter(Boolean).join(" / ");
      items.push({
        productId: card.id,
        variantId: v.id,
        productHandle: card.handle,
        title: card.title,
        variantTitle: normalizeVariantTitle(card.quickAddVariantId ? "Default Title" : label) ?? "",
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        image: v.image ?? card.image,
        qty: l.qty,
      });
    }
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
