import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { renderSampleEmail } from "@/lib/email/sample-data";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";
import { trackingReminderTemplate, deliveryCheckTemplate } from "@/lib/email/templates";
import { DELIVERY_CHECK_DEFAULT_CONTENT, deliveryCheckContactUrl, sendDueDeliveryChecks } from "@/lib/email/delivery-check";
import { buildReviewItemsForOrder } from "@/lib/reviews/review-items";
import { TRACKING_REMINDER_DEFAULT_CONTENT, sendDueTrackingReminders } from "@/lib/email/tracking-reminders";
import { sendShippingEmailForFulfillment } from "@/lib/email/fulfillment-shipping-email";
import { sendDueReviewRequests } from "@/lib/reviews/send-due";

// Fixed recipient: this endpoint can only ever email the shop's own support inbox, never a customer.
const HEALTH_RECIPIENT = "support@jawhara.se";

/**
 * End-to-end check of the real production email path (Resend key, sending domain, templates).
 * Every email goes to support@jawhara.se with a [TEST] subject; nothing is recorded as sent.
 *   {}                                  -> sample shipping confirmation + sample reminder
 *   { "fulfillmentId": "<uuid>" }       -> that real shipment's shipping email, built exactly as
 *                                          the admin sends it (items, images, address, tracking)
 *   { "remindersAt": "<ISO date>" }     -> the reminder job as it would run at that moment, every
 *                                          due email redirected to support
 *   { "reviewRequestsAt": "<ISO date>" } -> the review-request job as it would run then (ignores
 *                                          the on/off switch), every due email redirected to support
 *   { "sample": "delivery_check", "orderId"?: "<uuid>" } -> the "Har du fått ditt paket?" email
 *                                          (with that real order's review links when given)
 *   { "deliveryChecksAt": "<ISO date>" } -> the delivery-check job as it would run then, every due
 *                                          email redirected to support
 * Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.fulfillmentId === "string") {
    const ok = await sendShippingEmailForFulfillment(body.fulfillmentId, { testRecipient: HEALTH_RECIPIENT });
    return NextResponse.json({ ok, to: HEALTH_RECIPIENT, fulfillmentId: body.fulfillmentId }, { status: ok ? 200 : 502 });
  }
  if (typeof body?.remindersAt === "string") {
    const at = new Date(body.remindersAt);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Invalid remindersAt" }, { status: 400 });
    const run = await sendDueTrackingReminders(at, { testRecipient: HEALTH_RECIPIENT });
    return NextResponse.json({ ok: run.failed === 0, to: HEALTH_RECIPIENT, ...run }, { status: run.failed === 0 ? 200 : 502 });
  }

  if (typeof body?.reviewRequestsAt === "string") {
    const at = new Date(body.reviewRequestsAt);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Invalid reviewRequestsAt" }, { status: 400 });
    const run = await sendDueReviewRequests({ now: at, testRecipient: HEALTH_RECIPIENT });
    return NextResponse.json({ ok: run.failed === 0, to: HEALTH_RECIPIENT, ...run }, { status: run.failed === 0 ? 200 : 502 });
  }

  if (typeof body?.deliveryChecksAt === "string") {
    const at = new Date(body.deliveryChecksAt);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Invalid deliveryChecksAt" }, { status: 400 });
    const run = await sendDueDeliveryChecks(at, { testRecipient: HEALTH_RECIPIENT });
    return NextResponse.json({ ok: run.failed === 0, to: HEALTH_RECIPIENT, ...run }, { status: run.failed === 0 ? 200 : 502 });
  }

  if (body?.sample === "delivery_check") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
    const draft = deliveryCheckTemplate(DELIVERY_CHECK_DEFAULT_CONTENT, {
      orderNumber: "#SE1234",
      contactUrl: deliveryCheckContactUrl("#SE1234"),
      trackingPageUrl: "https://jawhara.se/sparra-mitt-paket",
      reviewItems: typeof body.orderId === "string" ? await buildReviewItemsForOrder(body.orderId, siteUrl) : [],
    });
    const sent = await sendEmail({ to: HEALTH_RECIPIENT, subject: `[UTKAST] ${draft.subject}`, html: draft.html, replyTo: HEALTH_RECIPIENT });
    return NextResponse.json({ ok: sent.ok, to: HEALTH_RECIPIENT, sent }, { status: sent.ok ? 200 : 502 });
  }

  const shipping = renderSampleEmail("shipping_confirmation", await getLiveEmailTemplate("shipping_confirmation"));
  const reminder = trackingReminderTemplate(TRACKING_REMINDER_DEFAULT_CONTENT, {
    orderNumber: "#SE1234",
    shipments: [{ trackingNumber: "YT2632000713274332", carrier: "YunExpress" }],
    trackingPageUrl: "https://jawhara.se/sparra-mitt-paket",
  });

  const results = {
    shipping_confirmation: await sendEmail({ to: HEALTH_RECIPIENT, subject: `[TEST] ${shipping.subject}`, html: shipping.html }),
    tracking_reminder: await sendEmail({ to: HEALTH_RECIPIENT, subject: `[TEST] ${reminder.subject}`, html: reminder.html }),
  };
  const ok = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok, to: HEALTH_RECIPIENT, results }, { status: ok ? 200 : 502 });
}
