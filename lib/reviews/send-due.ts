import { supabaseService } from "@/lib/supabase/service-client";
import { sendReviewRequestEmail } from "@/lib/email/review-request";
import { buildReviewLinkUrl } from "@/lib/reviews/token";
import { getOrderItemImages } from "@/lib/order-images";
import { normalizeVariantTitle } from "@/lib/variant-title";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/send-due.ts must never be imported into client code");
}

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;
const ELIGIBLE_FINANCIAL_STATUSES = ["paid", "partially_refunded"];

export type ReviewRequestRun = { enabled: boolean; due: number; sent: number; skipped: number; failed: number; orders: string[] };

/**
 * Sends every review-request email that is due (review_request_schedule.send_after has passed),
 * one per order, listing each distinct product with its own signed review link (verified purchase).
 * Only runs while store_settings.review_request_emails_enabled is true (admin Reviews page).
 *
 * Each row is claimed ('scheduled' -> 'sending') before sending, so overlapping runs never double-
 * send. A send Resend rejects goes back to 'scheduled' and is retried next run, up to 5 attempts.
 *
 * Testing only (app/api/email-health): `testRecipient` sends every due email there with a [TEST]
 * subject, ignores the on/off setting, and changes nothing in the schedule.
 */
export async function sendDueReviewRequests(options: { now?: Date; testRecipient?: string } = {}): Promise<ReviewRequestRun> {
  const now = options.now ?? new Date();
  const test = options.testRecipient;
  const run: ReviewRequestRun = { enabled: true, due: 0, sent: 0, skipped: 0, failed: 0, orders: [] };

  if (!test) {
    const { data: setting } = await supabaseService.from("store_settings").select("value").eq("key", "review_request_emails_enabled").single();
    if (setting?.value !== true) return { ...run, enabled: false };
  }

  const { data: due, error: dueError } = await supabaseService
    .from("review_request_schedule")
    .select("id, order_id, attempts")
    .eq("status", "scheduled")
    .lte("send_after", now.toISOString())
    .order("send_after")
    .limit(BATCH_SIZE);
  if (dueError) throw new Error(`Could not load due review requests: ${dueError.message}`);
  run.due = due?.length ?? 0;

  const setStatus = async (id: string, fields: Record<string, unknown>) => {
    if (!test) await supabaseService.from("review_request_schedule").update(fields).eq("id", id);
  };

  for (const row of due ?? []) {
    if (!test) {
      const { data: claimed, error: claimError } = await supabaseService
        .from("review_request_schedule")
        .update({ status: "sending" })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (claimError) throw new Error(`Could not claim review request ${row.id}: ${claimError.message}`);
      if (!claimed) continue; // another run got it
    }

    try {
      const { data: order } = await supabaseService
        .from("orders")
        .select("order_number, email, financial_status, cancelled_at, is_test_order")
        .eq("id", row.order_id)
        .maybeSingle();

      // Re-checked at send time: a cancellation/refund after shipping still suppresses it.
      if (
        !order ||
        !order.email ||
        order.cancelled_at ||
        order.is_test_order ||
        !ELIGIBLE_FINANCIAL_STATUSES.includes((order.financial_status ?? "").toLowerCase())
      ) {
        await setStatus(row.id, { status: "skipped" });
        run.skipped += 1;
        continue;
      }

      const { data: items } = await supabaseService
        .from("order_items")
        .select("product_id, title, variant_id, product_variants(title), products(handle, status)")
        .eq("order_id", row.order_id);

      // One invite per distinct product still on sale (not per variant/line item).
      const byProduct = new Map<string, { title: string; variantTitle: string | null; handle: string; variantId: string | null; productId: string }>();
      for (const i of items ?? []) {
        const product = (i as any).products;
        if (!i.product_id || byProduct.has(i.product_id) || !product?.handle || product.status !== "active") continue;
        byProduct.set(i.product_id, {
          title: i.title,
          // Shopify's "Default Title" (single-variant products) is never shown to customers.
          variantTitle: normalizeVariantTitle((i as any).product_variants?.title ?? null),
          handle: product.handle,
          variantId: i.variant_id,
          productId: i.product_id,
        });
      }
      const products = Array.from(byProduct.values());
      if (products.length === 0) {
        await setStatus(row.id, { status: "skipped" });
        run.skipped += 1;
        continue;
      }

      const images = await getOrderItemImages(
        products.filter((p) => p.variantId).map((p) => ({ id: p.variantId!, variantId: p.variantId, productId: p.productId }))
      );
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
      const sent = await sendReviewRequestEmail({
        to: test ?? order.email,
        subjectPrefix: test ? "[TEST] " : undefined,
        orderNumber: order.order_number,
        items: products.map((p) => ({
          title: p.title,
          variantTitle: p.variantTitle,
          imageUrl: p.variantId ? images[p.variantId]?.imageUrl ?? null : null,
          reviewUrl: buildReviewLinkUrl(p.handle, row.order_id, p.productId, siteUrl),
        })),
      });
      if (!sent.ok) throw new Error(sent.error);

      await setStatus(row.id, { status: "sent", sent_at: new Date().toISOString() });
      run.sent += 1;
      run.orders.push(order.order_number);
    } catch (err) {
      const attempts = row.attempts + 1;
      await setStatus(row.id, {
        status: attempts >= MAX_ATTEMPTS ? "failed" : "scheduled",
        attempts,
        last_error: ((err as Error)?.message ?? "unknown error").slice(0, 500),
      });
      run.failed += 1;
    }
  }
  return run;
}
