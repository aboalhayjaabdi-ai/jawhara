import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { renderSampleEmail } from "@/lib/email/sample-data";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";
import { trackingReminderTemplate } from "@/lib/email/templates";
import { TRACKING_REMINDER_DEFAULT_CONTENT } from "@/lib/email/tracking-reminders";

// Fixed recipient: this endpoint can only ever email the shop's own support inbox, never a customer.
const HEALTH_RECIPIENT = "support@jawhara.se";

/**
 * End-to-end check of the real production email path (Resend key, sending domain, templates):
 * sends a [TEST] shipping confirmation and a [TEST] tracking reminder, both with sample data, to
 * support@jawhara.se and returns Resend's verdict for each. Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
