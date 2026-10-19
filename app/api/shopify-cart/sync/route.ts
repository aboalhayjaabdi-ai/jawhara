import { NextRequest, NextResponse } from "next/server";
import { syncShopifyCart, type ShopifyCartSyncLine } from "@/lib/shopify/cart-sync";

// Keeps the real Shopify Storefront API cart (Phase 2) in step with the Jawhara cart stored in
// the browser, and (Phase 3) hands back its checkoutUrl for the "Till kassan" redirect. Always
// receives the FULL current cart, never a single add/remove delta -- see syncShopifyCart's own
// comment for why. Never used to price anything: /api/cart/totals stays the one source of truth
// for what the customer sees, since admin-managed discounts (3-for-2 etc.) aren't implemented on
// the Shopify side yet -- Shopify's own cart cost can disagree with it (see cart-drawer.tsx).
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

  // Server-side gate, independent of the UI hiding the "Till kassan" button (same philosophy as
  // the old Stripe-era app/api/checkout/route.ts) -- a checkoutUrl is never handed to the browser
  // until checkout is explicitly turned on, however this endpoint is called.
  if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== "true") {
    return NextResponse.json({ ...result, checkoutUrl: null });
  }
  return NextResponse.json(result);
}
