import { supabaseService } from "@/lib/supabase/service-client";

export type CustomerListRow = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  acceptsMarketing: boolean;
  tags: string[];
  note: string | null;
  source: "shopify" | "manual";
  shopifyId: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  country: string | null;
};

/**
 * Loads every customer merged with its order_stats (LTV/order count/last order) and default-
 * address country, in one shot. Customers (~500 rows, growing slowly) are small enough that
 * fetching all of them and filtering/sorting/paginating in application code -- the same
 * scale-proportionate choice Phase 3 made for collection product sorting -- is simpler and more
 * honest than a dual DB-paginated/fetch-all code path with no existing default behavior to
 * preserve (this is new, there's nothing to regress). Used by the customer list page, CSV export,
 * and saved-view/segment evaluation, so all three can never disagree on the numbers.
 */
export async function listCustomersWithStats(): Promise<CustomerListRow[]> {
  const [{ data: customers }, { data: stats }, { data: addresses }] = await Promise.all([
    supabaseService
      .from("customers")
      .select("id, email, first_name, last_name, phone, accepts_marketing, tags, note, source, shopify_id, anonymized_at, created_at"),
    supabaseService.from("customer_order_stats").select("customer_id, order_count, total_spent, last_order_at"),
    supabaseService.from("addresses").select("customer_id, country, is_default").not("customer_id", "is", null),
  ]);

  const statsById = new Map((stats ?? []).map((s) => [s.customer_id, s]));
  const countryById = new Map<string, string>();
  for (const a of addresses ?? []) {
    if (!a.customer_id || !a.country) continue;
    if (a.is_default || !countryById.has(a.customer_id)) countryById.set(a.customer_id, a.country);
  }

  return (customers ?? []).map((c) => {
    const s = statsById.get(c.id);
    return {
      id: c.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      acceptsMarketing: c.accepts_marketing,
      tags: c.tags ?? [],
      note: c.note,
      source: c.source,
      shopifyId: c.shopify_id,
      anonymizedAt: c.anonymized_at,
      createdAt: c.created_at,
      orderCount: s?.order_count ?? 0,
      totalSpent: Number(s?.total_spent ?? 0),
      lastOrderAt: s?.last_order_at ?? null,
      country: countryById.get(c.id) ?? null,
    };
  });
}

export async function getCustomerStats(customerId: string): Promise<{ orderCount: number; totalSpent: number; lastOrderAt: string | null }> {
  const { data } = await supabaseService.from("customer_order_stats").select("order_count, total_spent, last_order_at").eq("customer_id", customerId).maybeSingle();
  return { orderCount: data?.order_count ?? 0, totalSpent: Number(data?.total_spent ?? 0), lastOrderAt: data?.last_order_at ?? null };
}
