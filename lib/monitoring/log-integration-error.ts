import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/monitoring/log-integration-error.ts must never be imported into client code");
}

/**
 * Durable, queryable record of integration failures (webhook processing, Meta CAPI, the
 * reconciliation cron) -- a Vercel function's console.error is invisible to anyone without direct
 * Vercel log access, which this app's own operators don't have day to day. Never throws itself:
 * a logging failure must never mask or replace the original error it's recording.
 */
export async function logIntegrationError(
  source: "webhook" | "capi" | "cron_sync",
  message: string,
  context?: Record<string, unknown>,
  orderId?: string | null
): Promise<void> {
  try {
    await supabaseService.from("integration_errors").insert({
      source,
      message,
      context: context ?? null,
      order_id: orderId ?? null,
    });
  } catch {
    // Logging is best-effort only.
  }
}
