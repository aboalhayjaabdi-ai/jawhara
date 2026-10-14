import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendReviewRequestEmail } from "@/lib/email/review-request";
import { buildReviewLinkUrl } from "@/lib/reviews/token";
import { getOrderItemImages } from "@/lib/order-images";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const ELIGIBLE_FINANCIAL_STATUSES = ["paid", "partially_refunded"];

/**
 * Vercel Cron target (see vercel.json) -- runs daily. Only ever sends when
 * store_settings.review_request_emails_enabled is true; otherwise this is a safe no-op even
 * though due rows keep accumulating (they aren't lost, just not acted on until enabled).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: setting } = await supabaseService.from("store_settings").select("value").eq("key", "review_request_emails_enabled").single();
  if (setting?.value !== true) {
    return NextResponse.json({ ok: true, enabled: false, sent: 0, skipped: 0 });
  }

  const { data: due, error: dueError } = await supabaseService
    .from("review_request_schedule")
    .select("id, order_id, attempts")
    .eq("status", "scheduled")
    .lte("send_after", new Date().toISOString())
    .limit(BATCH_SIZE);
  if (dueError) {
    console.error("Failed to query due review requests:", dueError);
    return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    // Atomic claim: only one cron run (even an overlapping one) can move a row out of
    // 'scheduled', so the same order can never be emailed twice from a race.
    const { data: claimed, error: claimError } = await supabaseService
      .from("review_request_schedule")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (claimError) console.error(`Failed to claim review request schedule row ${row.id}:`, claimError);
    if (!claimed) continue;

    try {
      const { data: order } = await supabaseService
        .from("orders")
        .select("order_number, email, financial_status, cancelled_at")
        .eq("id", row.order_id)
        .maybeSingle();

      // Re-check eligibility at send time -- a cancellation/refund after shipment must still
      // suppress the email, even though the row was already scheduled.
      if (!order || !order.email || order.cancelled_at || !ELIGIBLE_FINANCIAL_STATUSES.includes((order.financial_status ?? "").toLowerCase())) {
        await supabaseService.from("review_request_schedule").update({ status: "skipped" }).eq("id", row.id);
        skipped += 1;
        continue;
      }

      const { data: items } = await supabaseService
        .from("order_items")
        .select("product_id, title, variant_id, product_variants(title), products(handle)")
        .eq("order_id", row.order_id);

      // One row per distinct product (not per variant/line item) -- a customer who bought the
      // same product in two colors gets one review invite for it, not two.
      const byProduct = new Map<string, { title: string; variantTitle: string | null; handle: string | null; variantId: string | null; productId: string }>();
      for (const i of items ?? []) {
        if (!i.product_id || byProduct.has(i.product_id)) continue;
        byProduct.set(i.product_id, {
          title: i.title,
          variantTitle: (i as any).product_variants?.title ?? null,
          handle: (i as any).products?.handle ?? null,
          variantId: i.variant_id,
          productId: i.product_id,
        });
      }
      const products = Array.from(byProduct.values());
      if (products.length === 0) {
        await supabaseService.from("review_request_schedule").update({ status: "skipped" }).eq("id", row.id);
        skipped += 1;
        continue;
      }

      const imagesByVariantId = await getOrderItemImages(
        products.filter((p) => p.variantId).map((p) => ({ id: p.variantId!, variantId: p.variantId, productId: p.productId }))
      );
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";

      const reviewItems = products.map((p) => ({
        title: p.title,
        variantTitle: p.variantTitle,
        imageUrl: p.variantId ? (imagesByVariantId[p.variantId]?.imageUrl ?? null) : null,
        reviewUrl: buildReviewLinkUrl(p.handle ?? "", row.order_id, p.productId, siteUrl),
      }));

      await sendReviewRequestEmail({ to: order.email, orderNumber: order.order_number, items: reviewItems });

      await supabaseService.from("review_request_schedule").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      console.error(`Review request send failed for schedule row ${row.id} (attempt ${attempts}):`, err);
      await supabaseService
        .from("review_request_schedule")
        .update({
          status: giveUp ? "failed" : "scheduled", // back to 'scheduled' so the next run retries, unless attempts are exhausted
          attempts,
          last_error: (err as Error).message?.slice(0, 500) ?? "unknown error",
        })
        .eq("id", row.id);
      skipped += 1;
    }
  }

  return NextResponse.json({ ok: true, enabled: true, sent, skipped });
}
