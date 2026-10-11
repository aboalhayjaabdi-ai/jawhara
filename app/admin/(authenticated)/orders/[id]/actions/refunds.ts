"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { stripe } from "@/lib/stripe/server";
import { getStripeRefundablePayment } from "@/lib/orders/refund-guard";
import { sendRefundNotificationEmail } from "@/lib/email/refund-notification";

export type RefundLineInput = { orderItemId: string; quantity: number; amount: number };
export type RefundResult = { ok: true; refundId: string; mode: "stripe" | "manual" } | { ok: false; error: string };

/**
 * The only place in the admin UI that can create a refund. Branches on
 * getStripeRefundablePayment() -- the single shared guard -- so a historical Shopify-origin order
 * (or a manual order marked "paid outside the system") can NEVER reach stripe.refunds.create():
 * when no refundable Stripe payment exists, this writes a manual_historical refund row only, with
 * zero Stripe API calls of any kind.
 */
export async function createRefund(
  orderId: string,
  input: { amount: number; reason?: string; lineItems?: RefundLineInput[]; returnId?: string }
): Promise<RefundResult> {
  const admin = await requireAdmin();
  if (input.amount <= 0) return { ok: false, error: "Beloppet måste vara större än noll." };

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, email, total_price")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Ordern hittades inte." };

  const { data: existingRefunds } = await supabaseService.from("refunds").select("amount").eq("order_id", orderId);
  const alreadyRefunded = (existingRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const isFull = alreadyRefunded + input.amount >= Number(order.total_price) - 0.01;

  const refundablePayment = await getStripeRefundablePayment(orderId);

  let refundId: string;
  let mode: "stripe" | "manual";

  if (refundablePayment) {
    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create({
        payment_intent: refundablePayment.stripePaymentIntentId,
        amount: Math.round(input.amount * 100),
      });
    } catch (err) {
      return { ok: false, error: `Stripe-återbetalning misslyckades: ${(err as Error).message}` };
    }

    const { data: refundRow, error } = await supabaseService
      .from("refunds")
      .insert({
        order_id: orderId,
        return_id: input.returnId ?? null,
        stripe_refund_id: stripeRefund.id,
        kind: isFull ? "full" : "partial",
        amount: input.amount,
        reason: input.reason || null,
        created_by: admin.adminId,
      })
      .select("id")
      .single();
    if (error || !refundRow) return { ok: false, error: error?.message ?? "Kunde inte spara återbetalningen." };
    refundId = refundRow.id;
    mode = "stripe";

    await supabaseService
      .from("payments")
      .update({ status: isFull ? "refunded" : "partially_refunded" })
      .eq("id", refundablePayment.paymentId);
  } else {
    const { data: refundRow, error } = await supabaseService
      .from("refunds")
      .insert({
        order_id: orderId,
        return_id: input.returnId ?? null,
        kind: "manual_historical",
        amount: input.amount,
        reason: input.reason || null,
        created_by: admin.adminId,
      })
      .select("id")
      .single();
    if (error || !refundRow) return { ok: false, error: error?.message ?? "Kunde inte spara återbetalningen." };
    refundId = refundRow.id;
    mode = "manual";
  }

  if (input.lineItems?.length) {
    await supabaseService
      .from("refund_items")
      .insert(input.lineItems.map((li) => ({ refund_id: refundId, order_item_id: li.orderItemId, quantity: li.quantity, amount: li.amount })));
    for (const li of input.lineItems) {
      const { data: item } = await supabaseService.from("order_items").select("refunded_quantity").eq("id", li.orderItemId).maybeSingle();
      if (item) {
        await supabaseService.from("order_items").update({ refunded_quantity: item.refunded_quantity + li.quantity }).eq("id", li.orderItemId);
      }
    }
  }

  await supabaseService.from("orders").update({ financial_status: isFull ? "REFUNDED" : "PARTIALLY_REFUNDED" }).eq("id", orderId);

  if (order.email) {
    await sendRefundNotificationEmail({ to: order.email, orderNumber: order.order_number, refundAmount: input.amount, reason: input.reason });
  }

  await logAdminAction(admin.adminId, mode === "stripe" ? "orders.refund_stripe" : "orders.refund_manual", "order", orderId, {
    refundId,
    amount: input.amount,
    reason: input.reason ?? null,
    isFull,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, refundId, mode };
}
