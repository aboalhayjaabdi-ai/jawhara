"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

export async function createShippingCarrier(
  name: string,
  trackingUrlTemplate: string,
  trackingApiCarrierCode: number | null
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };

  const { data: existing } = await supabaseService.from("shipping_carriers").select("id").order("position", { ascending: false }).limit(1);
  const nextPosition = (existing?.[0] ? 1 : 0) + (existing?.length ?? 0);

  const { data, error } = await supabaseService
    .from("shipping_carriers")
    .insert({
      name,
      tracking_url_template: trackingUrlTemplate || null,
      tracking_api_carrier_code: trackingApiCarrierCode,
      position: nextPosition,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Kunde inte skapa transportören." };

  await logAdminAction(admin.adminId, "shipping_carriers.create", "shipping_carrier", data.id, { name });
  revalidatePath("/admin/settings/carriers");
  return { ok: true, data: { id: data.id } };
}

export async function updateShippingCarrier(
  id: string,
  name: string,
  trackingUrlTemplate: string,
  trackingApiCarrierCode: number | null
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };

  const { error } = await supabaseService
    .from("shipping_carriers")
    .update({ name, tracking_url_template: trackingUrlTemplate || null, tracking_api_carrier_code: trackingApiCarrierCode })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_carriers.update", "shipping_carrier", id, { name });
  revalidatePath("/admin/settings/carriers");
  return { ok: true };
}

export async function deleteShippingCarrier(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("shipping_carriers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_carriers.delete", "shipping_carrier", id);
  revalidatePath("/admin/settings/carriers");
  return { ok: true };
}
