import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendRefundNotificationEmail } from "@/lib/email/refund-notification";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text(); // signature verification needs the exact raw bytes, not parsed JSON

  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  // Idempotency: insert the event id first. A unique-constraint conflict means this exact
  // event was already processed (Stripe retries deliveries) -- stop here, don't reprocess.
  const { error: dedupeError } = await supabaseService
    .from("webhook_events")
    .insert({ stripe_event_id: event.id, type: event.type });
  if (dedupeError) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
    } else if (event.type === "charge.refunded") {
      await handleRefund(event.data.object as Stripe.Charge);
    }
  } catch (err) {
    // Processing failed after the idempotency row was already inserted -- remove it so a
    // genuine Stripe retry of this same event can reprocess instead of being silently deduped
    // into a permanently stuck half-processed order. Returning 500 tells Stripe to retry.
    await supabaseService.from("webhook_events").delete().eq("stripe_event_id", event.id);
    console.error(`Webhook processing failed for ${event.id} (${event.type}):`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  const { data: orderItems } = await supabaseService
    .from("order_items")
    .select("variant_id, quantity, product_variants(inventory_tracked, inventory_policy)")
    .eq("order_id", orderId);

  // Atomic, race-safe oversell check: decrement every line item; if ANY fails, nothing can be
  // un-decremented for the ones that already succeeded except by explicitly restoring them, so
  // we restore on partial failure and refund + flag instead of silently confirming an order we
  // can't actually fulfill.
  //
  // Three cases per Shopify's own real semantics (see lib/inventory.ts):
  // - inventory_tracked = false: never touch the row at all. The recorded quantity is
  //   meaningless for an untracked variant, so there's nothing to decrement or oversell-check.
  // - tracked + policy CONTINUE: unconditional decrement (force_decrement_inventory), can go
  //   negative by design -- the merchant explicitly chose to keep selling past zero.
  // - tracked + policy DENY (the default): the existing strict, atomic decrement_inventory,
  //   which fails if there isn't enough stock.
  const decremented: { variantId: string; qty: number }[] = [];
  let oversold = false;
  for (const item of orderItems ?? []) {
    if (!item.variant_id) continue;
    const variant = (item as any).product_variants;
    if (!variant?.inventory_tracked) continue; // untracked -- never decremented, never oversells
    if (variant.inventory_policy === "CONTINUE") {
      await supabaseService.rpc("force_decrement_inventory", { p_variant_id: item.variant_id, p_qty: item.quantity });
      decremented.push({ variantId: item.variant_id, qty: item.quantity });
      continue;
    }
    const { data: ok } = await supabaseService.rpc("decrement_inventory", {
      p_variant_id: item.variant_id,
      p_qty: item.quantity,
    });
    if (ok) {
      decremented.push({ variantId: item.variant_id, qty: item.quantity });
    } else {
      oversold = true;
      break;
    }
  }

  if (oversold) {
    // Roll back whatever was already decremented in this same pass. force_decrement_inventory
    // rows are safe to "roll back" with the same unconditional function (it's just add-back).
    for (const d of decremented) {
      await supabaseService.rpc("force_decrement_inventory", { p_variant_id: d.variantId, p_qty: -d.qty });
    }
    await supabaseService.from("orders").update({ financial_status: "voided", tags: ["oversold-auto-refunded"] }).eq("id", orderId);
    if (typeof session.payment_intent === "string") {
      await stripe.refunds.create({ payment_intent: session.payment_intent });
    }
    await supabaseService
      .from("payments")
      .update({ status: "refunded" })
      .eq("stripe_checkout_session_id", session.id);
    return;
  }

  // Shipping address: session.shipping_details is the field populated for this pinned API version
  // (2025-02-24.acacia); collected_information.shipping_details is a newer-API-version alternate
  // shape, kept as a fallback for forward compatibility if Stripe ever changes what's populated.
  const shippingDetails = session.shipping_details ?? (session as any).collected_information?.shipping_details ?? null;
  const shippingAddress = shippingDetails?.address;
  let shippingAddressId: string | null = null;
  if (shippingAddress) {
    const { data: addressRow } = await supabaseService
      .from("addresses")
      .insert({
        order_id: orderId,
        first_name: shippingDetails?.name ?? null,
        address1: shippingAddress.line1 ?? null,
        address2: shippingAddress.line2 ?? null,
        city: shippingAddress.city ?? null,
        province: shippingAddress.state ?? null,
        zip: shippingAddress.postal_code ?? null,
        country_code: shippingAddress.country ?? null,
        phone: shippingDetails?.phone ?? session.customer_details?.phone ?? null,
      })
      .select("id")
      .single();
    shippingAddressId = addressRow?.id ?? null;
  }

  await supabaseService
    .from("orders")
    .update({
      financial_status: "paid",
      processed_at: new Date().toISOString(),
      shipping_address_id: shippingAddressId,
      phone: shippingDetails?.phone ?? session.customer_details?.phone ?? null,
    })
    .eq("id", orderId);

  const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
  await supabaseService
    .from("payments")
    .update({
      status: "succeeded",
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripe_customer_id: stripeCustomerId,
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", session.id);

  // Record discount redemptions now that payment is actually confirmed (not at checkout-session
  // creation, so an abandoned session never consumes a limited-use code's allowance).
  const discountTitles: string[] = session.metadata?.applied_discount_ids
    ? JSON.parse(session.metadata.applied_discount_ids)
    : [];
  for (const discountId of discountTitles) {
    await supabaseService.from("discount_redemptions").insert({
      discount_id: discountId,
      order_id: orderId,
      customer_email: session.customer_email ?? session.customer_details?.email ?? null,
    });
  }

  const { data: order } = await supabaseService
    .from("orders")
    .select("order_number, email, subtotal_price, total_discounts, total_tax, total_shipping, total_price")
    .eq("id", orderId)
    .single();
  const { data: items } = await supabaseService.from("order_items").select("title, quantity, unit_price").eq("order_id", orderId);
  const { data: addressRow } = shippingAddressId
    ? await supabaseService.from("addresses").select("first_name, address1, address2, city, zip, country_code").eq("id", shippingAddressId).single()
    : { data: null };

  if (order?.email) {
    await sendOrderConfirmationEmail({
      to: order.email,
      orderNumber: order.order_number,
      items: (items ?? []).map((i) => ({ title: i.title, qty: i.quantity, unitPrice: Number(i.unit_price) })),
      subtotal: Number(order.subtotal_price ?? 0),
      discountTotal: Number(order.total_discounts ?? 0),
      vat: Number(order.total_tax ?? 0),
      shipping: Number(order.total_shipping ?? 0),
      total: Number(order.total_price),
      shippingAddress: addressRow
        ? { name: addressRow.first_name, address1: addressRow.address1, address2: addressRow.address2, city: addressRow.city, zip: addressRow.zip, country: addressRow.country_code }
        : null,
    });
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  await supabaseService
    .from("payments")
    .update({ status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id);
}

async function handleRefund(charge: Stripe.Charge) {
  if (typeof charge.payment_intent !== "string") return;
  await supabaseService.from("payments").update({ status: "refunded" }).eq("stripe_payment_intent_id", charge.payment_intent);

  const { data: payment } = await supabaseService
    .from("payments")
    .select("order_id, amount")
    .eq("stripe_payment_intent_id", charge.payment_intent)
    .single();
  if (payment) {
    await supabaseService.from("refunds").insert({ order_id: payment.order_id, amount: payment.amount });

    const { data: order } = await supabaseService.from("orders").select("order_number, email").eq("id", payment.order_id).single();
    if (order?.email) {
      await sendRefundNotificationEmail({ to: order.email, orderNumber: order.order_number, refundAmount: Number(payment.amount) });
    }
  }
}
