"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireRole, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { anonymizeCustomer } from "@/lib/admin/gdpr";
import { getCustomerStats } from "@/lib/admin/customer-stats";

export type ActionResult = { ok: true; restricted?: boolean } | { ok: false; error: string; needsAnonymize?: boolean };

export async function anonymizeCustomerAction(customerId: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;
  if (!confirmed) return { ok: false, error: "Bekräfta för att anonymisera kunden permanent." };

  const result = await anonymizeCustomer(customerId);
  if (!result.ok) return result;

  await supabaseService.from("customer_data_requests").insert({
    customer_id: customerId,
    kind: "deletion",
    status: result.restricted ? "restricted" : "completed",
    reason: result.restricted ? "Orderhistorik måste bevaras för bokföringsändamål -- personuppgifter anonymiserade istället för radering." : null,
    requested_by: admin.adminId,
  });

  await logAdminAction(admin.adminId, "customers.anonymize", "customer", customerId, { restricted: result.restricted });
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return { ok: true, restricted: result.restricted };
}

export async function deleteCustomerAction(customerId: string, confirmed: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;
  if (!confirmed) return { ok: false, error: "Bekräfta för att radera kunden permanent." };

  const stats = await getCustomerStats(customerId);
  if (stats.orderCount > 0) {
    return { ok: false, error: "Kunden har orderhistorik som måste bevaras för bokföringsändamål -- använd Anonymisera istället.", needsAnonymize: true };
  }

  // Insert the accountability record BEFORE deleting -- customer_data_requests.customer_id is
  // ON DELETE SET NULL (migration 0017), so this row survives the delete below with its
  // customer_id simply going to null; inserting it after the delete would fail the FK outright.
  await supabaseService.from("customer_data_requests").insert({
    customer_id: customerId,
    kind: "deletion",
    status: "completed",
    requested_by: admin.adminId,
  });

  const { error } = await supabaseService.from("customers").delete().eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.delete", "customer", customerId);
  revalidatePath("/admin/customers");
  return { ok: true };
}
