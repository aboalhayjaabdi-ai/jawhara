import { supabaseService } from "@/lib/supabase/service-client";
import { sendEmail } from "./send";
import { deliveryCheckTemplate, type EmailTemplateContent } from "./templates";
import { buildTrackingLinkUrl } from "@/lib/tracking/token";
import { buildReviewItemsForOrder } from "@/lib/reviews/review-items";

if (typeof window !== "undefined") {
  throw new Error("lib/email/delivery-check.ts must never be imported into client code");
}

/** Copy for the "Har du fått ditt paket?" email (lib/email/templates.ts deliveryCheckTemplate). */
export const DELIVERY_CHECK_DEFAULT_CONTENT: EmailTemplateContent = {
  subject: "Har du fått ditt paket? — order {{orderNumber}}",
  heading: "Hur gick det med din beställning?",
  introHtml:
    '<p style="font-size: 14px; line-height: 1.6;">Hej {{firstName}}!</p><p style="font-size: 14px; line-height: 1.6;">Det har nu gått en tid sedan du gjorde din beställning {{orderNumber}}, och vi vill bara höra hur det har gått.</p>',
  outroHtml:
    '<p style="font-size: 13px; line-height: 1.6; color: #666;">Om något inte är som det ska, oavsett vad, hör av dig till oss först – vi löser det alltid tillsammans med dig.</p>',
};

/** Pre-filled email to support with the order number in the subject. */
export function deliveryCheckContactUrl(orderNumber: string): string {
  return `mailto:support@jawhara.se?subject=${encodeURIComponent(`Mitt paket – order ${orderNumber}`)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sent this long after the order was placed (orders.created_at). */
const DELIVERY_CHECK_AFTER_DAYS = 20;
/** ...and only considered for this long after that, so a scheduler that skipped a day still sends
 * it, but orders from weeks back are never emailed out of the blue. */
const DELIVERY_CHECK_WINDOW_DAYS = 7;
/** Only orders placed from 1 November 2026 (Swedish time) get this email. */
const ORDERS_FROM = "2026-11-01T00:00:00+01:00";
// Never unpaid (pending/voided) or fully refunded orders; cancelled and test orders are skipped too.
const ELIGIBLE_FINANCIAL_STATUSES = ["paid", "partially_refunded"];
/** One audit_log row per order (no actor: sent by the system) -- the activity-log record and the
 * "already sent" marker in one, so the feature needs no schema change. */
const SENT_ACTION = "email.delivery_check_sent";
const SUPPORT_EMAIL = "support@jawhara.se";

type DueOrder = {
  id: string;
  email: string | null;
  shipping_address_id: string | null;
  order_number: string;
  cancelled_at: string | null;
  is_test_order: boolean | null;
  financial_status: string | null;
};

/** The first name on the order's shipping address, capitalised ("sara" -> "Sara"), or null. */
async function orderFirstName(shippingAddressId: string | null): Promise<string | null> {
  if (!shippingAddressId) return null;
  const { data } = await supabaseService.from("addresses").select("first_name").eq("id", shippingAddressId).maybeSingle();
  const first = (data?.first_name ?? "").trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toLocaleUpperCase("sv-SE") + first.slice(1).toLocaleLowerCase("sv-SE");
}

export type DeliveryCheckRun = { due: number; sent: number; skipped: number; failed: number; orders: string[] };

/**
 * Sends "Har du fått ditt paket?" once per order, 20 days after the order was placed, to every
 * eligible order placed from 1 November 2026 (whether or not it has shipped yet). Each order is marked in audit_log before its email is sent and the
 * mark is removed if Resend rejects it, so it goes out exactly once. Replies go to support.
 *
 * Testing only (app/api/email-health): `testRecipient` sends every due email there with a [TEST]
 * subject and records nothing.
 */
export async function sendDueDeliveryChecks(now: Date = new Date(), options: { testRecipient?: string } = {}): Promise<DeliveryCheckRun> {
  const dueBefore = new Date(now.getTime() - DELIVERY_CHECK_AFTER_DAYS * DAY_MS).toISOString();
  const notOlderThan = new Date(now.getTime() - (DELIVERY_CHECK_AFTER_DAYS + DELIVERY_CHECK_WINDOW_DAYS) * DAY_MS).toISOString();

  const { data, error } = await supabaseService
    .from("orders")
    .select("id, email, order_number, cancelled_at, is_test_order, financial_status, shipping_address_id")
    .gte("created_at", ORDERS_FROM)
    .lte("created_at", dueBefore)
    .gte("created_at", notOlderThan);
  if (error) throw new Error(`Could not load due delivery checks: ${error.message}`);

  const byOrder = new Map<string, DueOrder>();
  for (const order of (data ?? []) as DueOrder[]) byOrder.set(order.id, order);

  const alreadySent = new Set<string>();
  const orderIds = [...byOrder.keys()];
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data: logged } = await supabaseService
      .from("audit_log")
      .select("entity_id")
      .eq("action", SENT_ACTION)
      .eq("entity_type", "order")
      .in("entity_id", orderIds.slice(i, i + 200));
    for (const l of logged ?? []) if (l.entity_id) alreadySent.add(l.entity_id);
  }

  const test = options.testRecipient;
  const run: DeliveryCheckRun = { due: 0, sent: 0, skipped: 0, failed: 0, orders: [] };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";

  for (const [orderId, order] of byOrder) {
    if (alreadySent.has(orderId)) continue;
    run.due += 1;
    if (
      !order.email ||
      order.cancelled_at ||
      order.is_test_order ||
      !ELIGIBLE_FINANCIAL_STATUSES.includes((order.financial_status ?? "").toLowerCase())
    ) {
      run.skipped += 1;
      continue;
    }

    // Recorded before sending, so an overlapping run never sends it twice; removed again if the
    // send fails, so the next run retries it.
    const { data: marks, error: markError } = test
      ? { data: [] as { id: string }[], error: null }
      : await supabaseService
          .from("audit_log")
          .insert({ actor_id: null, action: SENT_ACTION, entity_type: "order", entity_id: orderId, detail: { orderNumber: order.order_number } })
          .select("id");
    if (markError) {
      run.failed += 1;
      continue;
    }

    const { subject, html } = deliveryCheckTemplate(DELIVERY_CHECK_DEFAULT_CONTENT, {
      orderNumber: order.order_number,
      firstName: await orderFirstName(order.shipping_address_id),
      contactUrl: deliveryCheckContactUrl(order.order_number),
      trackingPageUrl: buildTrackingLinkUrl(orderId, siteUrl),
      reviewItems: await buildReviewItemsForOrder(orderId, siteUrl),
    });
    const sent = await sendEmail(
      test
        ? { to: test, subject: `[TEST] ${subject}`, html, replyTo: SUPPORT_EMAIL }
        : { to: order.email, subject, html, replyTo: SUPPORT_EMAIL }
    );
    run.orders.push(order.order_number);
    if (sent.ok) {
      run.sent += 1;
    } else {
      run.failed += 1;
      if (!test) await supabaseService.from("audit_log").delete().in("id", (marks ?? []).map((m) => m.id));
    }
  }
  return run;
}
