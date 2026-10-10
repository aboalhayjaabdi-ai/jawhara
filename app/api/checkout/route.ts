import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { computeCheckoutTotals, type CartLineInput } from "@/lib/discounts";

export async function POST(req: NextRequest) {
  // Server-side gate, independent of the UI hiding the "Till kassan" button -- checkout
  // cannot be driven to a real charge until this is explicitly flipped on.
  if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== "true") {
    return NextResponse.json({ error: "Kassan är inte tillgänglig ännu." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const cart: CartLineInput[] = body?.cart;
  const discountCode: string | null = body?.discountCode || null;
  const email: string | undefined = body?.email;

  if (!Array.isArray(cart) || cart.length === 0) {
    return NextResponse.json({ error: "Varukorgen är tom." }, { status: 400 });
  }

  const totals = await computeCheckoutTotals(cart, discountCode, email);
  if (totals.errors.length > 0) {
    return NextResponse.json({ errors: totals.errors }, { status: 400 });
  }
  if (totals.total <= 0) {
    return NextResponse.json({ error: "Summan måste vara större än 0 kr." }, { status: 400 });
  }

  // Pending order first, so the Checkout Session's metadata can reference a real order id;
  // the webhook is the only place this ever becomes "paid" (see app/api/webhooks/stripe/route.ts).
  const { data: order, error: orderError } = await supabaseService
    .from("orders")
    .insert({
      order_number: `JH-${Date.now()}`,
      email: email ?? null,
      currency_code: "SEK",
      financial_status: "pending",
      subtotal_price: totals.subtotal,
      total_shipping: totals.shipping,
      total_tax: totals.vat,
      total_discounts: totals.discountTotal,
      total_price: totals.total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Kunde inte skapa order." }, { status: 500 });
  }

  const orderItems = totals.lines.map((line) => ({
    order_id: order.id,
    variant_id: line.variantId,
    product_id: line.productId,
    title: "", // filled from a real product lookup below
    quantity: line.qty,
    unit_price: line.unitPrice,
  }));
  // Pull real titles for the order_items.title (not-null column) -- never fabricated.
  const { data: products } = await supabaseService
    .from("products")
    .select("id, title")
    .in(
      "id",
      orderItems.map((i) => i.product_id)
    );
  const titleByProductId = new Map((products ?? []).map((p) => [p.id, p.title]));
  for (const item of orderItems) item.title = titleByProductId.get(item.product_id) ?? "";

  await supabaseService.from("order_items").insert(orderItems);

  const lineItems = totals.lines.map((line) => ({
    quantity: line.qty,
    price_data: {
      currency: "sek",
      unit_amount: Math.round(line.unitPrice * 100), // öre
      product_data: { name: titleByProductId.get(line.productId) ?? "Jawhara-produkt" },
    },
  }));

  // Discounts are applied as a single negative line item rather than Stripe coupons, since
  // the eligible amount was already computed server-side from the real BXGY/percentage rules
  // above -- Stripe just needs the final correct total, not to re-derive it.
  if (totals.discountTotal > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "sek",
        unit_amount: -Math.round(totals.discountTotal * 100),
        product_data: { name: `Rabatt (${totals.appliedDiscounts.map((d) => d.title).join(", ")})` },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    mode: "payment",
    line_items: lineItems,
    customer_email: email,
    metadata: {
      order_id: order.id,
      applied_discount_ids: JSON.stringify(totals.appliedDiscounts.map((d) => d.discountId)),
    },
    return_url: `${req.nextUrl.origin}/kassa/bekraftelse?session_id={CHECKOUT_SESSION_ID}`,
  });

  await supabaseService.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  await supabaseService.from("payments").insert({
    order_id: order.id,
    stripe_checkout_session_id: session.id,
    kind: "sale",
    status: "pending",
    gateway: "stripe",
    amount: totals.total,
    currency_code: "SEK",
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
