import { NextRequest, NextResponse } from "next/server";
import { getCartRecommendationBundle, getCartRecommendations, RECOMMENDATION_MODES, type RecommendationMode } from "@/lib/cart-recommendations";

// Read-only product suggestions for the cart drawer's carousel. Never prices anything or touches
// discounts -- whatever gets added from the carousel is priced by the same /api/cart/totals and
// Shopify cart sync as any other add-to-cart.
const MAX_IDS = 50;

function stringList(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length < 200).slice(0, max) : [];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mode = body?.mode as RecommendationMode | "all";
  if (mode === "all") {
    try {
      const byMode = await getCartRecommendationBundle({
        cartProductIds: stringList(body?.cartProductIds, MAX_IDS),
        cartVariantIds: stringList(body?.cartVariantIds, MAX_IDS),
        viewedHandles: stringList(body?.viewedHandles, 10),
      });
      return NextResponse.json({ byMode });
    } catch {
      return NextResponse.json({ byMode: {} });
    }
  }
  if (!RECOMMENDATION_MODES.includes(mode)) {
    return NextResponse.json({ error: "Ogiltig typ." }, { status: 400 });
  }
  try {
    const products = await getCartRecommendations({
      mode,
      cartProductIds: stringList(body?.cartProductIds, MAX_IDS),
      cartVariantIds: stringList(body?.cartVariantIds, MAX_IDS),
      viewedHandles: stringList(body?.viewedHandles, 10),
    });
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
