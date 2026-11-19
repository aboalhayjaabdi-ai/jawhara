import { supabaseService } from "@/lib/supabase/service-client";
import { shopifyGraphQL, storeForNode } from "./client";
import type { StoreKey } from "./stores";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/fulfilled-quantities.ts must never be imported into client code");
}

// Kept small so the query stays far below Shopify's per-query cost limit. An order with more
// fulfillments/lines than this is not guessed at: the recompute stops without writing anything.
const MAX_FULFILLMENTS = 10;
const MAX_LINES_PER_FULFILLMENT = 25;

const FULFILLMENT_LINES_QUERY = `
  query($id: ID!) {
    order(id: $id) {
      fulfillments(first: ${MAX_FULFILLMENTS}) {
        id
        status
        fulfillmentLineItems(first: ${MAX_LINES_PER_FULFILLMENT}) {
          pageInfo { hasNextPage }
          nodes { quantity lineItem { id } }
        }
      }
    }
  }
`;

type FulfillmentLines = {
  id: string;
  status: string;
  fulfillmentLineItems: { pageInfo: { hasNextPage: boolean }; nodes: { quantity: number; lineItem: { id: string } | null }[] };
};

// Shopify fulfillment statuses that mean the goods did not (or no longer) count as shipped.
const NOT_SHIPPED = new Set(["CANCELLED", "ERROR", "FAILURE"]);

const tail = (gid: string) => gid.split("/").pop()!;

/**
 * Pure part of the recompute (unit-testable): how many of each order line are shipped.
 *  - Order with a Shopify id: what Shopify's own fulfillments say per line (whoever created them:
 *    Jawhara admin, the ERP API, or someone fulfilling directly in Shopify), plus any Jawhara-only
 *    shipment that never reached Shopify (fulfillments without a shopify_id).
 *  - Order without a Shopify id: every Jawhara shipment's lines.
 * Cancelled shipments never count, and a line never counts as more shipped than ordered.
 */
export function computeFulfilledQuantities(input: {
  orderHasShopifyId: boolean;
  items: { id: string; shopifyId: string | null; quantity: number }[];
  localFulfillments: { shopifyId: string | null; status: string | null; items: { orderItemId: string; quantity: number }[] }[];
  shopifyFulfillments: FulfillmentLines[] | null;
}): Map<string, number> {
  const shipped = new Map<string, number>(input.items.map((i) => [i.id, 0]));
  for (const f of input.localFulfillments) {
    if ((f.status ?? "").toUpperCase() === "CANCELLED") continue;
    if (input.orderHasShopifyId && f.shopifyId) continue; // counted from Shopify below
    for (const fi of f.items) if (shipped.has(fi.orderItemId)) shipped.set(fi.orderItemId, shipped.get(fi.orderItemId)! + fi.quantity);
  }
  if (input.orderHasShopifyId && input.shopifyFulfillments) {
    const itemByShopifyLine = new Map(input.items.filter((i) => i.shopifyId).map((i) => [i.shopifyId!, i.id]));
    for (const f of input.shopifyFulfillments) {
      if (NOT_SHIPPED.has((f.status ?? "").toUpperCase())) continue;
      for (const n of f.fulfillmentLineItems.nodes) {
        const itemId = n.lineItem ? itemByShopifyLine.get(tail(n.lineItem.id)) : undefined;
        if (itemId) shipped.set(itemId, shipped.get(itemId)! + n.quantity);
      }
    }
  }
  for (const i of input.items) shipped.set(i.id, Math.min(i.quantity, Math.max(0, shipped.get(i.id)!)));
  return shipped;
}

/**
 * Sets order_items.fulfilled_quantity -- what the ERP API and admin use for "left to ship" -- from
 * the real state, instead of only adding up shipments created through Jawhara. This is what makes
 * a (partial) shipment created directly in Shopify count too. Only rows whose value actually
 * changes are written. Throws (writing nothing) if Shopify can't be read or the order is larger
 * than the query covers; callers decide whether that is fatal.
 *
 * `expectShopifyFulfillmentId`: the caller just created this fulfillment in Shopify; if Shopify's
 * answer doesn't include it yet, throw rather than write a count without it.
 */
export async function recomputeFulfilledQuantities(
  orderId: string,
  opts: { store?: StoreKey; expectShopifyFulfillmentId?: string | null } = {}
): Promise<{ quantities: Map<string, number>; updated: number }> {
  const { data: order, error: orderError } = await supabaseService.from("orders").select("id, shopify_id").eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error(`order ${orderId} not found: ${orderError?.message ?? ""}`);
  const [{ data: items, error: itemsError }, { data: fulfillments, error: fError }] = await Promise.all([
    supabaseService.from("order_items").select("id, shopify_id, quantity, fulfilled_quantity").eq("order_id", orderId),
    supabaseService.from("fulfillments").select("id, shopify_id, status, fulfillment_items(order_item_id, quantity)").eq("order_id", orderId),
  ]);
  if (itemsError || fError) throw new Error(`could not read order ${orderId}: ${(itemsError ?? fError)!.message}`);

  let shopifyFulfillments: FulfillmentLines[] | null = null;
  if (order.shopify_id) {
    const gid = `gid://shopify/Order/${order.shopify_id}`;
    const store = opts.store ?? (await storeForNode(gid));
    if (!store) throw new Error(`order ${order.shopify_id} not found in any Shopify store`);
    const data = await shopifyGraphQL<{ order: { fulfillments: FulfillmentLines[] } | null }>(FULFILLMENT_LINES_QUERY, { id: gid }, store);
    if (!data.order) throw new Error(`Shopify order ${order.shopify_id} not found`);
    shopifyFulfillments = data.order.fulfillments;
    if (shopifyFulfillments.length >= MAX_FULFILLMENTS || shopifyFulfillments.some((f) => f.fulfillmentLineItems.pageInfo.hasNextPage)) {
      throw new Error(`Shopify order ${order.shopify_id} has more fulfillments/lines than the recompute covers`);
    }
    if (opts.expectShopifyFulfillmentId && !shopifyFulfillments.some((f) => tail(f.id) === tail(opts.expectShopifyFulfillmentId!))) {
      throw new Error(`Shopify does not list fulfillment ${opts.expectShopifyFulfillmentId} yet`);
    }
  }

  const quantities = computeFulfilledQuantities({
    orderHasShopifyId: !!order.shopify_id,
    items: (items ?? []).map((i: any) => ({ id: i.id, shopifyId: i.shopify_id, quantity: i.quantity })),
    localFulfillments: (fulfillments ?? []).map((f: any) => ({
      shopifyId: f.shopify_id,
      status: f.status,
      items: (f.fulfillment_items ?? []).map((fi: any) => ({ orderItemId: fi.order_item_id, quantity: fi.quantity })),
    })),
    shopifyFulfillments,
  });

  let updated = 0;
  for (const i of items ?? []) {
    const next = quantities.get(i.id)!;
    if (next === i.fulfilled_quantity) continue;
    const { error } = await supabaseService.from("order_items").update({ fulfilled_quantity: next }).eq("id", i.id);
    if (error) throw new Error(`could not update order item ${i.id}: ${error.message}`);
    updated += 1;
  }
  return { quantities, updated };
}
