"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type StoreSettingsInput = {
  businessName: string;
  supportEmail: string;
  supportPhone: string;
  businessAddress: string;
  vatRatePercent: number;
};

async function setSetting(key: string, value: unknown) {
  const { error } = await supabaseService.from("store_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
  return error;
}

export async function updateStoreSettings(input: StoreSettingsInput): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!input.businessName.trim()) return { ok: false, error: "Butiksnamn krävs." };
  if (input.vatRatePercent < 0 || input.vatRatePercent > 100) return { ok: false, error: "Momssats måste vara mellan 0 och 100." };

  const errors = await Promise.all([
    setSetting("business_name", input.businessName.trim()),
    setSetting("support_email", input.supportEmail.trim()),
    setSetting("support_phone", input.supportPhone.trim()),
    setSetting("business_address", input.businessAddress.trim()),
    setSetting("vat_rate_percent", input.vatRatePercent),
  ]);
  const firstError = errors.find((e) => e);
  if (firstError) return { ok: false, error: firstError.message };

  await logAdminAction(admin.adminId, "settings.update", "store_settings", undefined, { businessName: input.businessName, vatRatePercent: input.vatRatePercent });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateLogoUrl(logoUrl: string | null): Promise<ActionResult> {
  const admin = await requireAdmin();
  const error = await setSetting("logo_url", logoUrl);
  if (error) return { ok: false, error: error.message };
  await logAdminAction(admin.adminId, "settings.update_logo", "store_settings", undefined, { logoUrl });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
