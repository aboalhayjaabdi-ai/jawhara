import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/discount-stats.ts must never be imported into client code");
}

export type DiscountRedemptionRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  customerEmail: string | null;
  redeemedAt: string;
};

export type DiscountStats = {
  redemptionCount: number;
  /** Sum of orders.total_discounts for orders where this was the ONLY discount redeemed -- the
   * only case where "this discount's amount" is unambiguous. discount_redemptions has no amount
   * column of its own (the webhook records who/when, not how much), so a stacked order's split
   * between multiple discounts genuinely isn't knowable -- never guessed or estimated. */
  attributedAmount: number;
  /** Orders where this discount redeemed alongside at least one other -- counted, but
   * deliberately excluded from attributedAmount above. */
  stackedOrderCount: number;
  redemptions: DiscountRedemptionRow[];
};

export async function getDiscountStats(discountId: string): Promise<DiscountStats> {
  const { data: redemptions } = await supabaseService
    .from("discount_redemptions")
    .select("id, order_id, customer_email, redeemed_at")
    .eq("discount_id", discountId)
    .order("redeemed_at", { ascending: false });

  if (!redemptions || redemptions.length === 0) {
    return { redemptionCount: 0, attributedAmount: 0, stackedOrderCount: 0, redemptions: [] };
  }

  const orderIds = Array.from(new Set(redemptions.map((r) => r.order_id)));

  const [{ data: allRedemptionsForOrders }, { data: orders }] = await Promise.all([
    supabaseService.from("discount_redemptions").select("order_id").in("order_id", orderIds),
    supabaseService.from("orders").select("id, order_number, total_discounts").in("id", orderIds),
  ]);

  const redemptionCountByOrder = new Map<string, number>();
  for (const r of allRedemptionsForOrders ?? []) {
    redemptionCountByOrder.set(r.order_id, (redemptionCountByOrder.get(r.order_id) ?? 0) + 1);
  }
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  let attributedAmount = 0;
  let stackedOrderCount = 0;
  for (const orderId of orderIds) {
    if ((redemptionCountByOrder.get(orderId) ?? 0) > 1) {
      stackedOrderCount++;
      continue;
    }
    attributedAmount += Number(orderById.get(orderId)?.total_discounts ?? 0);
  }

  return {
    redemptionCount: redemptions.length,
    attributedAmount,
    stackedOrderCount,
    redemptions: redemptions.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      orderNumber: orderById.get(r.order_id)?.order_number ?? null,
      customerEmail: r.customer_email,
      redeemedAt: r.redeemed_at,
    })),
  };
}
