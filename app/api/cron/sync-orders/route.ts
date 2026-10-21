import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { syncOrdersFromShopify } from "@/lib/shopify/sync-orders";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

/**
 * Reconciliation safety net, hit by three independent schedulers:
 *  - Vercel Cron, once daily (see vercel.json) -- the final backstop, authenticated with
 *    CRON_SECRET (Vercel attaches this automatically to its own cron requests).
 *  - A GitHub Actions workflow, nominally every 5 minutes (.github/workflows/sync-orders-recovery.yml)
 *    -- in practice GitHub's free-tier scheduler frequently skips sub-hourly ticks under load, so
 *    this runs far less often than configured. Kept as a secondary, free safety net. Authenticated
 *    with EXTERNAL_CRON_SECRET.
 *  - A Supabase pg_cron job, running every 5 minutes INSIDE the project's own Postgres instance via
 *    pg_net (see the one-off setup script) -- not subject to any external CI platform's scheduling
 *    throttling, so this is the reliable 5-minute path. Authenticated with SUPABASE_CRON_SECRET.
 * All three are independently rotatable/disposable.
 *
 * Shopify's own webhook delivery is explicitly "not always guaranteed" (their own docs' wording)
 * -- whichever of these re-pulls recent orders first, a missed webhook is caught quickly rather
 * than up to a day. Independent of the admin's manual "Sync from Shopify" button
 * (app/api/admin/orders/sync/route.ts, same underlying function with recoverySource omitted).
 * Passing a source here also recovers a genuinely missed Meta Purchase report or cancellation
 * email, tagged so purchase_tracking_log shows which path actually caught it -- see
 * syncOrdersFromShopify's own comment for why this can never duplicate one the webhook already
 * sent.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const source =
    authHeader === `Bearer ${process.env.CRON_SECRET}`
      ? "cron_sync"
      : authHeader === `Bearer ${process.env.EXTERNAL_CRON_SECRET}`
        ? "github_actions"
        : authHeader === `Bearer ${process.env.SUPABASE_CRON_SECRET}`
          ? "pg_cron"
          : null;
  if (!source) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncOrdersFromShopify(source);

  await supabaseService.from("cron_sync_runs").insert({
    source,
    pulled_count: result.pulledCount,
    imported_count: result.importedCount,
    error_count: result.errors.length,
  });
  if (result.errors.length) {
    await logIntegrationError("cron_sync", result.errors.join("; "), { source, pulledCount: result.pulledCount });
  }

  return NextResponse.json(result);
}
