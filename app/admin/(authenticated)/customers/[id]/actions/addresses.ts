"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type AddressInput = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  isDefault: boolean;
};

function toRow(input: AddressInput) {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    company: input.company,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    province: input.province,
    province_code: input.provinceCode,
    zip: input.zip,
    country: input.country,
    country_code: input.countryCode,
    phone: input.phone,
    is_default: input.isDefault,
  };
}

export async function addAddress(customerId: string, input: AddressInput): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (input.isDefault) await supabaseService.from("addresses").update({ is_default: false }).eq("customer_id", customerId);

  const { error } = await supabaseService.from("addresses").insert({ customer_id: customerId, ...toRow(input) });
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.add_address", "customer", customerId);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}

export async function updateAddress(customerId: string, addressId: string, input: AddressInput): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (input.isDefault) await supabaseService.from("addresses").update({ is_default: false }).eq("customer_id", customerId).neq("id", addressId);

  const { error } = await supabaseService.from("addresses").update(toRow(input)).eq("id", addressId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.update_address", "customer", customerId, { addressId });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}

export async function deleteAddress(customerId: string, addressId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const { error } = await supabaseService.from("addresses").delete().eq("id", addressId).eq("customer_id", customerId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.delete_address", "customer", customerId, { addressId });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}

export async function setDefaultAddress(customerId: string, addressId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  await supabaseService.from("addresses").update({ is_default: false }).eq("customer_id", customerId);
  const { error } = await supabaseService.from("addresses").update({ is_default: true }).eq("id", addressId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "customers.set_default_address", "customer", customerId, { addressId });
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true };
}
