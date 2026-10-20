import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { syncOrdersFromShopify } from "@/lib/shopify/sync-orders";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

/**
 * Reconciliation safety net, invoked by Vercel Cron (see vercel.json). Shopify's own webhook
 * delivery is explicitly "not always guaranteed" (their own docs' wording) -- this re-pulls
 * recent orders on a schedule so Jawhara stays correct even on a day webhooks are missed or
 * delayed, independent of the admin's manual "Sync from Shopify" button
 * (app/api/admin/orders/sync/route.ts, same underlying function).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncOrdersFromShopify();

  await supabaseService.from("cron_sync_runs").insert({
    pulled_count: result.pulledCount,
    imported_count: result.importedCount,
    error_count: result.errors.length,
  });
  if (result.errors.length) {
    await logIntegrationError("cron_sync", result.errors.join("; "), { pulledCount: result.pulledCount });
  }

  return NextResponse.json(result);
}
