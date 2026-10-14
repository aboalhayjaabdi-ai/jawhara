import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/schedule.ts must never be imported into client code");
}

const REVIEW_REQUEST_DELAY_DAYS = 14;
// Excludes unpaid (pending/voided) and fully refunded orders, per the governing instruction --
// partially_refunded still counts (the customer kept most of their order and shipped product).
const ELIGIBLE_FINANCIAL_STATUSES = ["paid", "partially_refunded"];

/**
 * Called once, right after an order's fulfillment_status first becomes FULFILLED ("Skickad") --
 * from both the single-order and bulk fulfillment actions. Inserts a schedule row due 14 days
 * out; the unique constraint on order_id makes this a no-op if the order is ever re-marked or
 * edited afterward, so the countdown can never restart. Never sends anything itself -- the cron
 * job (app/api/cron/review-requests/route.ts) is the only thing that ever emails a customer.
 */
export async function scheduleReviewRequest(orderId: string): Promise<void> {
  const { data: order } = await supabaseService
    .from("orders")
    .select("financial_status, cancelled_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.cancelled_at) return;
  if (!ELIGIBLE_FINANCIAL_STATUSES.includes((order.financial_status ?? "").toLowerCase())) return;

  const shippedAt = new Date();
  const sendAfter = new Date(shippedAt.getTime() + REVIEW_REQUEST_DELAY_DAYS * 24 * 60 * 60 * 1000);

  // Plain insert, not upsert -- a unique-violation (23505) on an existing order_id is the
  // expected, silent "don't restart the countdown" case, not a real error.
  const { error } = await supabaseService
    .from("review_request_schedule")
    .insert({ order_id: orderId, shipped_at: shippedAt.toISOString(), send_after: sendAfter.toISOString() });
  if (error && error.code !== "23505") {
    console.error(`Failed to schedule review request for order ${orderId}:`, error);
  }
}
