"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

export async function updateShippingSettings(allowedCountries: string[], flatRate: number): Promise<ActionResult> {
  const admin = await requireAdmin();

  const countries = allowedCountries.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (countries.length === 0) return { ok: false, error: "Minst ett land krävs." };
  if (countries.some((c) => !COUNTRY_CODE_RE.test(c))) return { ok: false, error: "Landskoder måste vara tvåbokstavskoder (t.ex. SE, DK, NO)." };
  if (flatRate < 0) return { ok: false, error: "Fraktpris kan inte vara negativt." };

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabaseService.from("store_settings").update({ value: countries, updated_at: new Date().toISOString() }).eq("key", "shipping_allowed_countries"),
    supabaseService.from("store_settings").update({ value: flatRate, updated_at: new Date().toISOString() }).eq("key", "shipping_flat_rate"),
  ]);
  const error = e1 ?? e2;
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "settings.update_shipping", "store_settings", undefined, { countries, flatRate });
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}
