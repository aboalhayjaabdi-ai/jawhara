import { NextRequest, NextResponse } from "next/server";
import { computeCheckoutTotals, type CartLineInput } from "@/lib/discounts";

// Read-only. The single authoritative place the cart drawer and /kassa's order-summary panel
// both call to compute what a customer will pay -- same function app/api/checkout/route.ts uses
// to actually create the Stripe session, so the two can never disagree. No DB writes, no Stripe
// calls, never gated behind NEXT_PUBLIC_CHECKOUT_ENABLED (showing someone an accurate price isn't
// a checkout action). Always re-derives price/stock/discount eligibility server-side from
// Supabase -- a client can send any variantId/qty/code it likes, never a price.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cart: CartLineInput[] = body?.cart;
  const discountCode: string | null = body?.discountCode || null;

  if (!Array.isArray(cart)) {
    return NextResponse.json({ error: "Ogiltig varukorg." }, { status: 400 });
  }
  if (cart.length === 0) {
    return NextResponse.json({
      lines: [],
      subtotal: 0,
      appliedDiscounts: [],
      discountTotal: 0,
      vat: 0,
      shipping: 0,
      total: 0,
      errors: [],
      discountNotices: [],
    });
  }

  const totals = await computeCheckoutTotals(cart, discountCode);
  return NextResponse.json(totals);
}
