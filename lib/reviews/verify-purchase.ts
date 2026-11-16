import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/verify-purchase.ts must never be imported into client code");
}

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Orders (not cancelled, not test) that contain this product. */
async function ordersWithProduct(productId: string, orderIds: string[]): Promise<string[]> {
  if (orderIds.length === 0) return [];
  const { data } = await supabaseService
    .from("order_items")
    .select("order_id, orders!inner(cancelled_at, is_test_order, created_at)")
    .eq("product_id", productId)
    .in("order_id", orderIds.slice(0, 200));
  return ((data ?? []) as any[])
    .filter((r) => !r.orders?.cancelled_at && !r.orders?.is_test_order)
    .sort((a, b) => (a.orders.created_at < b.orders.created_at ? 1 : -1))
    .map((r) => r.order_id as string);
}

/**
 * For a review written directly on the product page (no email link): finds a real order of this
 * product by the reviewer's email address, or failing that by their full name (first + last, as
 * on the order's shipping address). Returns that order's id -- the review is then shown as
 * "Verifierat köp" and linked to it -- or null when nothing matches. Orders already used for a
 * review of this product are skipped, so one purchase backs at most one verified review.
 */
export async function findPurchaseForReview(params: {
  productId: string;
  email: string | null;
  name: string | null;
}): Promise<{ orderId: string; matchedBy: "email" | "name"; email: string | null } | null> {
  const { productId } = params;

  const { data: used } = await supabaseService.from("reviews").select("order_id").eq("product_id", productId).not("order_id", "is", null);
  const alreadyReviewed = new Set((used ?? []).map((r) => r.order_id));
  const firstFree = (ids: string[]) => ids.find((id) => !alreadyReviewed.has(id)) ?? null;

  const email = params.email ? params.email.trim().toLowerCase() : null;
  if (email && email.includes("@")) {
    const { data: byEmail } = await supabaseService.from("orders").select("id").ilike("email", email).limit(200);
    const orderId = firstFree(await ordersWithProduct(productId, (byEmail ?? []).map((o) => o.id)));
    if (orderId) return { orderId, matchedBy: "email", email };
  }

  const name = params.name ? normalize(params.name) : "";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    // Shipping addresses are stored per order (addresses.order_id); match first + last name.
    const first = parts[0];
    const last = parts[parts.length - 1];
    const { data: addrs } = await supabaseService
      .from("addresses")
      .select("order_id, first_name, last_name")
      .ilike("first_name", `${first}%`)
      .ilike("last_name", `%${last}`)
      .not("order_id", "is", null)
      .limit(200);
    const exact = ((addrs ?? []) as any[]).filter((a) => normalize(`${a.first_name ?? ""} ${a.last_name ?? ""}`) === name);
    const orderId = firstFree(await ordersWithProduct(productId, exact.map((a) => a.order_id)));
    if (orderId) {
      const { data: order } = await supabaseService.from("orders").select("email").eq("id", orderId).maybeSingle();
      return { orderId, matchedBy: "name", email: order?.email ?? null };
    }
  }
  return null;
}
