import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/discount-scheduler.ts must never be imported into client code");
}

export type SyncResult = { activated: number; expired: number };

/**
 * Makes `starts_at`/`ends_at` scheduling genuinely functional. `lib/discounts.ts` (the real
 * checkout-time calculation engine, never touched by this phase) only ever reads
 * `status = 'active'` -- it has no concept of dates at all. Without this sync, an admin setting a
 * future `starts_at` on a 'scheduled' discount would see nothing actually happen at checkout once
 * that date arrives; this keeps the one column the engine actually reads in sync with the dates
 * the admin UI exposes, so scheduling has a real effect rather than being cosmetic.
 *
 * 'draft' is never auto-transitioned -- it's an explicit "not live" state the admin controls by
 * hand (matching Shopify's own distinction between a draft discount and a scheduled one).
 */
export async function syncDiscountStatuses(): Promise<SyncResult> {
  const nowIso = new Date().toISOString();

  const { data: activated } = await supabaseService
    .from("discounts")
    .update({ status: "active" })
    .eq("status", "scheduled")
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .select("id");

  const { data: expired } = await supabaseService
    .from("discounts")
    .update({ status: "expired" })
    .in("status", ["active", "scheduled"])
    .not("ends_at", "is", null)
    .lte("ends_at", nowIso)
    .select("id");

  return { activated: activated?.length ?? 0, expired: expired?.length ?? 0 };
}
