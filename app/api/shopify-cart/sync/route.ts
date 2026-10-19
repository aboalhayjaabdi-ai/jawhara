import { NextRequest, NextResponse } from "next/server";
import { syncShopifyCart, type ShopifyCartSyncLine } from "@/lib/shopify/cart-sync";

// Keeps the real Shopify Storefront API cart (Phase 2) in step with the Jawhara cart stored in
// the browser. Always receives the FULL current cart, never a single add/remove delta -- see
// syncShopifyCart's own comment for why. Never used to price anything: /api/cart/totals (Stripe-
// era, Supabase-priced) stays the one source of truth for what the customer sees and pays, since
// admin-managed discounts (3-for-2 etc.) aren't implemented on the Shopify side yet.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawLines = body?.lines;
  if (!Array.isArray(rawLines)) {
    return NextResponse.json({ error: "Ogiltig varukorg." }, { status: 400 });
  }

  const lines: ShopifyCartSyncLine[] = [];
  for (const l of rawLines) {
    if (typeof l?.variantId !== "string" || !Number.isFinite(l?.qty) || l.qty <= 0) {
      return NextResponse.json({ error: "Ogiltig varukorgsrad." }, { status: 400 });
    }
    lines.push({ variantId: l.variantId, qty: Math.floor(l.qty) });
  }

  const shopifyCartId = typeof body?.shopifyCartId === "string" ? body.shopifyCartId : null;

  const result = await syncShopifyCart({ shopifyCartId, lines });
  return NextResponse.json(result);
}
