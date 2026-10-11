import { supabaseService } from "@/lib/supabase/service-client";
import { getCustomerStats } from "./customer-stats";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/gdpr.ts must never be imported into client code");
}

export type CustomerExportData = {
  profile: Record<string, unknown>;
  addresses: Record<string, unknown>[];
  orders: Record<string, unknown>[];
};

/** Assembles a subject-access-request export: the customer's own profile, address book, and
 * full order history (matched the same customer_id-or-email way as customer_order_stats, so the
 * export and the profile page's order list can never disagree about which orders belong to this
 * customer). Read-only. */
export async function assembleCustomerExport(customerId: string): Promise<CustomerExportData | null> {
  const { data: customer } = await supabaseService
    .from("customers")
    .select("id, email, first_name, last_name, phone, accepts_marketing, marketing_consent_updated_at, note, tags, source, shopify_id, created_at")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return null;

  const { data: addresses } = await supabaseService
    .from("addresses")
    .select("first_name, last_name, company, address1, address2, city, province, zip, country, phone, is_default")
    .eq("customer_id", customerId);

  const orFilter = customer.email
    ? `customer_id.eq.${customerId},and(customer_id.is.null,email.ilike.${customer.email})`
    : `customer_id.eq.${customerId}`;
  const { data: orders } = await supabaseService
    .from("orders")
    .select("order_number, created_at, email, financial_status, fulfillment_status, source, currency_code, total_price, cancelled_at")
    .or(orFilter)
    .order("created_at", { ascending: false });

  return { profile: customer, addresses: addresses ?? [], orders: orders ?? [] };
}

export type AnonymizeResult = { ok: true; restricted: boolean } | { ok: false; error: string };

/**
 * GDPR erasure. Always scrubs the customer's own identifying fields (name/email/phone/note/tags)
 * and their personal address book -- but never their order_id-linked addresses (those are part of
 * a specific transaction's financial record, not the customer's identity profile) and never the
 * orders/payments rows themselves (Swedish accounting law requires retaining transaction records
 * for a statutory period; orders.customer_id already ON DELETE SET NULL, so even a hard customer
 * delete was always designed to preserve order history -- anonymization goes further and keeps a
 * live, now-scrubbed customer row so that history still resolves to *something* identifiable as
 * "a real past customer", just with no personal data left on it).
 *
 * `restricted: true` means this customer had real order history, so a full hard delete was never
 * on the table and anonymization is the actual erasure outcome. `restricted: false` means they had
 * none -- anonymization still fully achieves erasure, same as a hard delete would have.
 */
export async function anonymizeCustomer(customerId: string): Promise<AnonymizeResult> {
  const { data: customer } = await supabaseService.from("customers").select("id").eq("id", customerId).maybeSingle();
  if (!customer) return { ok: false, error: "Kunden hittades inte." };

  const stats = await getCustomerStats(customerId);
  const restricted = stats.orderCount > 0;

  const { error } = await supabaseService
    .from("customers")
    .update({
      first_name: "Anonymiserad",
      last_name: "kund",
      email: null,
      phone: null,
      note: null,
      tags: [],
      accepts_marketing: false,
      anonymized_at: new Date().toISOString(),
    })
    .eq("id", customerId);
  if (error) return { ok: false, error: error.message };

  await supabaseService
    .from("addresses")
    .update({ first_name: null, last_name: null, company: null, address1: null, address2: null, city: null, province: null, zip: null, phone: null })
    .eq("customer_id", customerId);

  return { ok: true, restricted };
}

