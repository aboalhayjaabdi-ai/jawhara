"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

function parseCountries(raw: string[]): { ok: true; countries: string[] } | { ok: false; error: string } {
  const countries = raw.map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (countries.length === 0) return { ok: false, error: "Minst ett land krävs." };
  if (countries.some((c) => !COUNTRY_CODE_RE.test(c))) return { ok: false, error: "Landskoder måste vara tvåbokstavskoder (t.ex. SE, DK, NO)." };
  return { ok: true, countries };
}

export async function createShippingZone(name: string, countries: string[]): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };
  const parsed = parseCountries(countries);
  if (!parsed.ok) return parsed;

  const { data: existing } = await supabaseService.from("shipping_zones").select("id").order("position", { ascending: false }).limit(1);
  const nextPosition = (existing?.[0] ? 1 : 0) + (existing?.length ?? 0);

  const { data, error } = await supabaseService.from("shipping_zones").insert({ name, countries: parsed.countries, position: nextPosition }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Kunde inte skapa zonen." };

  await logAdminAction(admin.adminId, "shipping_zones.create", "shipping_zone", data.id, { name, countries: parsed.countries });
  revalidatePath("/admin/settings/shipping");
  return { ok: true, data: { id: data.id } };
}

export async function updateShippingZone(id: string, name: string, countries: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };
  const parsed = parseCountries(countries);
  if (!parsed.ok) return parsed;

  const { error } = await supabaseService.from("shipping_zones").update({ name, countries: parsed.countries, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_zones.update", "shipping_zone", id, { name, countries: parsed.countries });
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}

export async function deleteShippingZone(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("shipping_zones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_zones.delete", "shipping_zone", id);
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}

export async function createShippingRate(zoneId: string, name: string, price: number, minOrderValue: number | null): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };
  if (price < 0) return { ok: false, error: "Pris kan inte vara negativt." };
  if (minOrderValue != null && minOrderValue < 0) return { ok: false, error: "Minsta ordervärde kan inte vara negativt." };

  const { data: existing } = await supabaseService.from("shipping_rates").select("id").eq("zone_id", zoneId).order("position", { ascending: false }).limit(1);
  const nextPosition = (existing?.[0] ? 1 : 0) + (existing?.length ?? 0);

  const { data, error } = await supabaseService
    .from("shipping_rates")
    .insert({ zone_id: zoneId, name, price, min_order_value: minOrderValue, position: nextPosition })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Kunde inte skapa fraktalternativet." };

  await logAdminAction(admin.adminId, "shipping_rates.create", "shipping_rate", data.id, { zoneId, name, price });
  revalidatePath("/admin/settings/shipping");
  return { ok: true, data: { id: data.id } };
}

export async function updateShippingRate(id: string, name: string, price: number, minOrderValue: number | null): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Namn krävs." };
  if (price < 0) return { ok: false, error: "Pris kan inte vara negativt." };
  if (minOrderValue != null && minOrderValue < 0) return { ok: false, error: "Minsta ordervärde kan inte vara negativt." };

  const { error } = await supabaseService.from("shipping_rates").update({ name, price, min_order_value: minOrderValue, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_rates.update", "shipping_rate", id, { name, price });
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}

export async function deleteShippingRate(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("shipping_rates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "shipping_rates.delete", "shipping_rate", id);
  revalidatePath("/admin/settings/shipping");
  return { ok: true };
}
