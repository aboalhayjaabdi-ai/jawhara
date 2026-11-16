import { NextRequest, NextResponse } from "next/server";
import { sendDueTrackingReminders } from "@/lib/email/tracking-reminders";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

/**
 * Daily: sends the "your parcel is on its way" reminder 7 days after a shipment's tracking was
 * added (lib/email/tracking-reminders.ts). Run by Vercel Cron (vercel.json, CRON_SECRET); the same
 * external schedulers as /api/cron/sync-orders may also call it. Safe to call any number of times:
 * each shipment is claimed atomically before its email is sent.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const matches = (secret: string | undefined) => !!secret && authHeader === `Bearer ${secret}`;
  if (![process.env.CRON_SECRET, process.env.EXTERNAL_CRON_SECRET, process.env.SUPABASE_CRON_SECRET].some(matches)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendDueTrackingReminders();
    return NextResponse.json(result);
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await logIntegrationError("email", `tracking reminders: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
