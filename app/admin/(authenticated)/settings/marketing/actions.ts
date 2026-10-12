"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateMarketingSettings(input: { metaPixelId: string; ga4MeasurementId: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  const settings = await getMarketingSettings();

  const { error } = await supabaseService
    .from("marketing_settings")
    .update({
      meta_pixel_id: input.metaPixelId.trim() || null,
      ga4_measurement_id: input.ga4MeasurementId.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: admin.adminId,
    })
    .eq("id", settings.id);
  if (error) return { ok: false, error: error.message };

  // Never logs the actual ID values -- harmless as IDs, but keeping the audit_log detail column
  // to booleans here is simplest and avoids ever having to reconsider this if a future field in
  // this same table becomes sensitive.
  await logAdminAction(admin.adminId, "marketing_settings.update_ids", "marketing_settings", settings.id, {
    pixelConfigured: !!input.metaPixelId.trim(),
    ga4Configured: !!input.ga4MeasurementId.trim(),
  });
  revalidatePath("/admin/settings/marketing");
  return { ok: true };
}

export async function updateMetaCapiToken(token: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const settings = await getMarketingSettings();

  const { error } = await supabaseService
    .from("marketing_settings")
    .update({ meta_capi_access_token: token.trim() || null, updated_at: new Date().toISOString(), updated_by: admin.adminId })
    .eq("id", settings.id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "marketing_settings.update_capi_token", "marketing_settings", settings.id, { configured: !!token.trim() });
  revalidatePath("/admin/settings/marketing");
  return { ok: true };
}

export async function clearMetaCapiToken(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const settings = await getMarketingSettings();

  const { error } = await supabaseService.from("marketing_settings").update({ meta_capi_access_token: null, updated_at: new Date().toISOString() }).eq("id", settings.id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "marketing_settings.clear_capi_token", "marketing_settings", settings.id);
  revalidatePath("/admin/settings/marketing");
  return { ok: true };
}
