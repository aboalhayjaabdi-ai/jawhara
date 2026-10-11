import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/orders/refund-guard.ts must never be imported into client code");
}

export type StripeRefundablePayment = {
  paymentId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
};

/**
 * The single enforcement point for "a historical Shopify-origin order must never trigger a real
 * Stripe refund or a new customer payment." Returns a refundable Stripe payment only when a
 * succeeded payment with a real stripe_payment_intent_id exists for this order -- which is never
 * the case for a Shopify-origin order (its payments rows, backfilled from Shopify transactions,
 * have no Stripe IDs at all) or a manual order marked "paid outside the system" (gateway: 'manual',
 * also no Stripe IDs). Every admin-initiated refund action must call this and branch on its
 * result instead of checking orders.source or orders.shopify_id directly -- a manual order paid
 * via a real Stripe Checkout session still has real money to refund through Stripe, so the check
 * has to be "is there real Stripe money on this order", not "what does the order claim its origin is".
 */
export async function getStripeRefundablePayment(orderId: string): Promise<StripeRefundablePayment | null> {
  const { data } = await supabaseService
    .from("payments")
    .select("id, stripe_payment_intent_id, amount, currency_code, processed_at")
    .eq("order_id", orderId)
    .eq("status", "succeeded")
    .not("stripe_payment_intent_id", "is", null)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.stripe_payment_intent_id) return null;
  return {
    paymentId: data.id,
    stripePaymentIntentId: data.stripe_payment_intent_id,
    amount: Number(data.amount ?? 0),
    currency: data.currency_code ?? "SEK",
  };
}
