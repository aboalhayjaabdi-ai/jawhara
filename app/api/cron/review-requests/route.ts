import { NextRequest, NextResponse } from "next/server";
import { sendDueReviewRequests } from "@/lib/reviews/send-due";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

/**
 * Daily (vercel.json): sends due review-request emails -- 14 days after an order's shipping email
 * with its tracking number went out (lib/reviews/schedule.ts). Does nothing while the admin's
 * "Recensionsmejl" switch is off. See lib/reviews/send-due.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const matches = (secret: string | undefined) => !!secret && authHeader === `Bearer ${secret}`;
  if (![process.env.CRON_SECRET, process.env.EXTERNAL_CRON_SECRET, process.env.SUPABASE_CRON_SECRET].some(matches)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const run = await sendDueReviewRequests();
    if (run.failed) await logIntegrationError("email", `review requests: ${run.failed} failed`, run);
    return NextResponse.json({ ok: true, ...run });
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await logIntegrationError("email", `review requests: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
