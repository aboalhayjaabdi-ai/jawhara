"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCustomerCore(
  customerId: string,
  input: { firstName: string; lastName: string; email: string; phone: string }
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { error } = await supabaseService
    .from("customers")
    .update({
      first_name: input.firstName.trim() || null,
      last_name: input.lastName.trim() || null,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
    })
    .eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.update", "customer", customerId, input);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

export async function updateCustomerNote(customerId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService.from("customers").update({ note: note.trim() || null }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.update_note", "customer", customerId);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}

export async function updateCustomerTags(customerId: string, tags: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  const { error } = await supabaseService.from("customers").update({ tags: cleaned }).eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.update_tags", "customer", customerId, { tags: cleaned });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true };
}

/** Toggling consent always bumps marketing_consent_updated_at to now -- same real-world behavior
 * Shopify itself tracks (a consent *change* has its own timestamp, distinct from when the
 * customer record was first created or imported). */
export async function updateMarketingConsent(customerId: string, accepts: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await supabaseService
    .from("customers")
    .update({ accepts_marketing: accepts, marketing_consent_updated_at: new Date().toISOString() })
    .eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.update_marketing_consent", "customer", customerId, { accepts });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}
