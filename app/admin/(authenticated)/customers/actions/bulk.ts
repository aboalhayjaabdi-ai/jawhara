"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type BulkResult = { ok: true; count: number; skipped: string[] } | { ok: false; error: string };

export async function bulkAddTags(customerIds: string[], tags: string[]): Promise<BulkResult> {
  const admin = await requireAdmin();
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  if (customerIds.length === 0 || cleaned.length === 0) return { ok: false, error: "Inga kunder eller taggar valda." };

  const { data: customers } = await supabaseService.from("customers").select("id, tags").in("id", customerIds);
  for (const c of customers ?? []) {
    const merged = Array.from(new Set([...(c.tags ?? []), ...cleaned]));
    await supabaseService.from("customers").update({ tags: merged }).eq("id", c.id);
  }
  await logAdminAction(admin.adminId, "customers.bulk_add_tags", undefined, undefined, { customerIds, tags: cleaned });
  revalidatePath("/admin/customers");
  return { ok: true, count: customers?.length ?? 0, skipped: [] };
}

export async function bulkRemoveTags(customerIds: string[], tags: string[]): Promise<BulkResult> {
  const admin = await requireAdmin();
  const toRemove = new Set(tags.map((t) => t.trim()).filter(Boolean));
  if (customerIds.length === 0 || toRemove.size === 0) return { ok: false, error: "Inga kunder eller taggar valda." };

  const { data: customers } = await supabaseService.from("customers").select("id, tags").in("id", customerIds);
  for (const c of customers ?? []) {
    const remaining = (c.tags ?? []).filter((t: string) => !toRemove.has(t));
    await supabaseService.from("customers").update({ tags: remaining }).eq("id", c.id);
  }
  await logAdminAction(admin.adminId, "customers.bulk_remove_tags", undefined, undefined, { customerIds, tags: Array.from(toRemove) });
  revalidatePath("/admin/customers");
  return { ok: true, count: customers?.length ?? 0, skipped: [] };
}

export async function bulkSetMarketingConsent(customerIds: string[], accepts: boolean): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (customerIds.length === 0) return { ok: false, error: "Inga kunder valda." };

  const { error } = await supabaseService
    .from("customers")
    .update({ accepts_marketing: accepts, marketing_consent_updated_at: new Date().toISOString() })
    .in("id", customerIds);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.bulk_set_marketing_consent", undefined, undefined, { customerIds, accepts });
  revalidatePath("/admin/customers");
  return { ok: true, count: customerIds.length, skipped: [] };
}

/**
 * Hard delete is only safe for customers with zero real orders -- anyone with order history must
 * go through the dedicated Anonymize action on their own profile page (lib/admin/gdpr.ts), which
 * preserves the financial record while scrubbing personal identifiers. This bulk action never
 * anonymizes on the caller's behalf; it only deletes what's genuinely safe to delete outright and
 * reports the rest as skipped, so an admin can't accidentally lose a legally-retained order's
 * customer link via a bulk click.
 */
export async function bulkDelete(customerIds: string[], confirmed: boolean): Promise<BulkResult> {
  const admin = await requireAdmin();
  if (customerIds.length === 0) return { ok: false, error: "Inga kunder valda." };

  const { data: stats } = await supabaseService.from("customer_order_stats").select("customer_id, order_count").in("customer_id", customerIds);
  const statsById = new Map((stats ?? []).map((s) => [s.customer_id, s.order_count]));
  const eligible = customerIds.filter((id) => (statsById.get(id) ?? 0) === 0);
  const skipped = customerIds.filter((id) => (statsById.get(id) ?? 0) > 0);

  if (!confirmed) return { ok: false, error: `Bekräfta för att radera ${eligible.length} kund(er) permanent. ${skipped.length} har orderhistorik och hoppas över oavsett.` };
  if (eligible.length === 0) return { ok: false, error: "Inga av de valda kunderna kan raderas (alla har orderhistorik) -- använd Anonymisera på kundens profil." };

  const { error } = await supabaseService.from("customers").delete().in("id", eligible);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.bulk_delete", undefined, undefined, { customerIds: eligible, skipped });
  revalidatePath("/admin/customers");
  return { ok: true, count: eligible.length, skipped };
}
