import { supabaseService } from "@/lib/supabase/service-client";
import { sendEmail } from "./send";
import { trackingReminderTemplate, type EmailTemplateContent } from "./templates";
import { getLiveEmailTemplate } from "@/lib/admin/email-templates";
import { buildTrackingLinkUrl } from "@/lib/tracking/token";

if (typeof window !== "undefined") {
  throw new Error("lib/email/tracking-reminders.ts must never be imported into client code");
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A shipment gets its reminder this long after its tracking was added. */
const REMINDER_AFTER_DAYS = 7;
/** ...and is only considered for this long after that, so a scheduler that skipped a day (or the
 * first run after this feature shipped) never reminds customers about weeks-old parcels. */
const REMINDER_WINDOW_DAYS = 7;

/** Sent as-is unless an email_templates row with key "tracking_reminder" exists (that row, once
 * added, makes the copy editable at /admin/email-templates like the other emails). */
export const TRACKING_REMINDER_DEFAULT_CONTENT: EmailTemplateContent = {
  subject: "Ditt paket är på väg — order {{orderNumber}}",
  heading: "Ditt paket är på väg till dig",
  introHtml:
    '<p style="font-size: 14px; line-height: 1.6;">Hej!</p><p style="font-size: 14px; line-height: 1.6;">Vi ville bara påminna dig om att din beställning är på väg. Paketet har lämnat oss och rör sig mot dig – du kan följa hela resan via länken nedan.</p>',
  outroHtml:
    '<p style="font-size: 13px; line-height: 1.6; color: #666;">Har paketet redan kommit fram? Då kan du bortse från det här mejlet – vi hoppas att du gillar det!</p>',
};

async function reminderContent(): Promise<EmailTemplateContent> {
  try {
    return await getLiveEmailTemplate("tracking_reminder");
  } catch {
    return TRACKING_REMINDER_DEFAULT_CONTENT;
  }
}

/** Each reminded shipment gets one audit_log row (no actor: sent by the system). It is both the
 * record shown in the admin's activity log and the "already sent" marker this job checks, so the
 * feature needs no schema change. */
const SENT_ACTION = "email.tracking_reminder_sent";

type DueRow = {
  id: string;
  order_id: string;
  tracking_number: string;
  tracking_company: string | null;
  delivered_at: string | null;
  tracking_cache: { raw_status: { status?: string } | null } | { raw_status: { status?: string } | null }[] | null;
  orders: { email: string | null; order_number: string; cancelled_at: string | null; is_test_order: boolean | null } | null;
};

function isDelivered(row: DueRow): boolean {
  if (row.delivered_at) return true;
  const cache = Array.isArray(row.tracking_cache) ? row.tracking_cache[0] : row.tracking_cache;
  return cache?.raw_status?.status === "Delivered";
}

export type TrackingReminderRun = { due: number; sent: number; skipped: number; failed: number };

/**
 * Sends the "your parcel is on its way" reminder for every shipment whose shipping confirmation
 * (with its tracking number) went out 7-14 days ago, one email per order (all of that
 * order's due tracking numbers together). A shipment is marked in audit_log before its email is
 * sent and the mark is removed if the send fails, so it is reminded exactly once. Skips cancelled
 * and test orders, and parcels already delivered.
 */
export async function sendDueTrackingReminders(now: Date = new Date()): Promise<TrackingReminderRun> {
  const dueBefore = new Date(now.getTime() - REMINDER_AFTER_DAYS * DAY_MS).toISOString();
  const notOlderThan = new Date(now.getTime() - (REMINDER_AFTER_DAYS + REMINDER_WINDOW_DAYS) * DAY_MS).toISOString();

  const { data, error } = await supabaseService
    .from("fulfillments")
    .select(
      "id, order_id, tracking_number, tracking_company, delivered_at, tracking_cache(raw_status), orders!inner(email, order_number, cancelled_at, is_test_order)"
    )
    .not("tracking_number", "is", null)
    .not("notification_sent_at", "is", null)
    .neq("status", "cancelled")
    // Counted from when the shipping email (with its tracking number) went out, which is also
    // when tracking was added for a shipment that got its number after it was created.
    .lte("notification_sent_at", dueBefore)
    .gte("notification_sent_at", notOlderThan);
  if (error) throw new Error(`Could not load due tracking reminders: ${error.message}`);

  const candidates = (data ?? []) as unknown as DueRow[];
  const alreadySent = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const { data: logged } = await supabaseService
      .from("audit_log")
      .select("entity_id")
      .eq("action", SENT_ACTION)
      .eq("entity_type", "fulfillment")
      .in("entity_id", candidates.slice(i, i + 200).map((c) => c.id));
    for (const l of logged ?? []) if (l.entity_id) alreadySent.add(l.entity_id);
  }
  const rows = candidates.filter((c) => !alreadySent.has(c.id));
  const run: TrackingReminderRun = { due: rows.length, sent: 0, skipped: 0, failed: 0 };

  const byOrder = new Map<string, DueRow[]>();
  for (const row of rows) {
    const order = row.orders;
    if (!order?.email || order.cancelled_at || order.is_test_order || isDelivered(row)) {
      run.skipped += 1;
      continue;
    }
    byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), row]);
  }
  if (byOrder.size === 0) return run;

  const content = await reminderContent();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";

  for (const [orderId, shipments] of byOrder) {
    // Recorded before sending, so a run that overlaps this one (or crashes mid-way) never sends the
    // same reminder twice; removed again if Resend rejects the email, so the next run retries it.
    const { data: marks, error: markError } = await supabaseService
      .from("audit_log")
      .insert(
        shipments.map((s) => ({
          actor_id: null,
          action: SENT_ACTION,
          entity_type: "fulfillment",
          entity_id: s.id,
          detail: { orderId, orderNumber: s.orders?.order_number, trackingNumber: s.tracking_number },
        }))
      )
      .select("id");
    if (markError) {
      run.failed += 1;
      continue;
    }

    const order = shipments[0].orders!;
    const { subject, html } = trackingReminderTemplate(content, {
      orderNumber: order.order_number,
      shipments: shipments.map((s) => ({ trackingNumber: s.tracking_number, carrier: s.tracking_company })),
      trackingPageUrl: buildTrackingLinkUrl(orderId, siteUrl),
    });
    const sent = await sendEmail({ to: order.email!, subject, html });
    if (sent.ok) {
      run.sent += 1;
    } else {
      run.failed += 1;
      await supabaseService.from("audit_log").delete().in("id", (marks ?? []).map((m) => m.id));
    }
  }
  return run;
}
