import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/review-verified-purchase.ts must never be imported into client code");
}

/**
 * "Verified purchase, where supported": the imported Judge.me rows never captured a reviewer
 * email, so their `verified_buyer` flag is left exactly as imported (preserved, never
 * recomputed). For a new manual review where the admin supplied a customer email, this checks
 * real orders for a genuine paid purchase of that specific product -- the same case-insensitive
 * email matching and financial_status set already proven in the `customer_order_stats` view
 * (migration 0016). Returns false (never guesses true) when no email was given or no match is
 * found.
 */
export async function checkVerifiedPurchase(customerEmail: string | null, productId: string): Promise<boolean> {
  if (!customerEmail) return false;

  const { data: orders } = await supabaseService
    .from("orders")
    .select("id, financial_status")
    .ilike("email", customerEmail);

  const paidOrderIds = (orders ?? [])
    .filter((o) => ["paid", "partially_refunded"].includes((o.financial_status ?? "").toLowerCase()))
    .map((o) => o.id);

  if (paidOrderIds.length === 0) return false;

  const { count } = await supabaseService
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .in("order_id", paidOrderIds);

  return (count ?? 0) > 0;
}
