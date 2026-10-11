"use server";

import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type CreateCustomerResult = { ok: true; customerId: string } | { ok: false; error: string };

export async function createCustomer(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  acceptsMarketing: boolean;
}): Promise<CreateCustomerResult> {
  const admin = await requireAdmin();
  const email = input.email?.trim() || null;
  const firstName = input.firstName?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  if (!email && !firstName && !lastName) return { ok: false, error: "Ange minst namn eller e-post." };

  const { data: customer, error } = await supabaseService
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: input.phone?.trim() || null,
      accepts_marketing: input.acceptsMarketing,
      marketing_consent_updated_at: input.acceptsMarketing ? new Date().toISOString() : null,
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !customer) return { ok: false, error: error?.message ?? "Kunde inte skapa kunden." };

  await logAdminAction(admin.adminId, "customers.create", "customer", customer.id, { email, firstName, lastName });
  return { ok: true, customerId: customer.id };
}
