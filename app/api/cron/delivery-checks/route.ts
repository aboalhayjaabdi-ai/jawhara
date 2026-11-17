import { NextRequest, NextResponse } from "next/server";
import { sendDueDeliveryChecks } from "@/lib/email/delivery-check";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

/**
 * Daily: sends "Har du fått ditt paket?" 20 days after an order was placed, for orders placed
 * from 1 November 2026 (lib/email/delivery-check.ts). Run by Vercel Cron (vercel.json,
 * CRON_SECRET); safe to call any number of times -- each order is marked before its email is sent.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const matches = (secret: string | undefined) => !!secret && authHeader === `Bearer ${secret}`;
  if (![process.env.CRON_SECRET, process.env.EXTERNAL_CRON_SECRET, process.env.SUPABASE_CRON_SECRET].some(matches)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendDueDeliveryChecks());
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    await logIntegrationError("email", `delivery checks: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
