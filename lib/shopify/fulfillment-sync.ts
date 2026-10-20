import { shopifyGraphQL } from "./client";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/fulfillment-sync.ts must never be imported into client code");
}

export type ShopifyFulfillmentResult =
  | { ok: true; shopifyFulfillmentId: string; shopifyFulfillmentOrderId: string | null; status: string }
  | { ok: false; error: string };

type FulfillmentOrderLineItemNode = {
  id: string;
  remainingQuantity: number;
  lineItem: { id: string };
};

type FulfillmentOrderNode = {
  id: string;
  status: string;
  lineItems: { edges: { node: FulfillmentOrderLineItemNode }[] };
};

const FULFILLMENT_ORDERS_QUERY = `
  query($orderId: ID!) {
    order(id: $orderId) {
      fulfillmentOrders(first: 20) {
        edges {
          node {
            id
            status
            lineItems(first: 100) {
              edges { node { id remainingQuantity lineItem { id } } }
            }
          }
        }
      }
    }
  }
`;

/** Bare numeric id -> the GraphQL global id Shopify's Admin API actually expects. */
function toGid(resource: string, id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/${resource}/${id}`;
}

function idTail(gid: string): string {
  return gid.split("/").pop()!;
}

/**
 * Resolves which real Shopify FulfillmentOrderLineItem each of our local order_items (keyed by
 * their Shopify line item id, order_items.shopify_id) corresponds to, and how much of it is
 * still actually fulfillable there -- the FulfillmentOrder-based workflow Shopify's Admin API
 * requires (the plain order-id fulfillment creation this replaced is deprecated). Only considers
 * OPEN fulfillment orders; a line item with nothing left to fulfill (already shipped, or on a
 * closed/cancelled fulfillment order) is silently skipped rather than erroring, since the caller
 * already filtered requested quantities against its own `fulfilled_quantity` bookkeeping -- this
 * is just the final, authoritative check against Shopify's own state.
 */
async function resolveFulfillmentOrderLineItems(
  shopifyOrderId: string,
  desired: { shopifyLineItemId: string; quantity: number }[]
): Promise<Map<string, { fulfillmentOrderId: string; lineItemId: string; quantity: number }[]>> {
  const data = await shopifyGraphQL<{ order: { fulfillmentOrders: { edges: { node: FulfillmentOrderNode }[] } } | null }>(
    FULFILLMENT_ORDERS_QUERY,
    { orderId: toGid("Order", shopifyOrderId) }
  );
  const fulfillmentOrders = data.order?.fulfillmentOrders.edges.map((e) => e.node) ?? [];

  // Group resolved fulfillment-order line items BY fulfillment order id, since fulfillmentCreate
  // needs one entry per fulfillment order even when a single shipment spans several of them
  // (e.g. items split across locations).
  const byFulfillmentOrder = new Map<string, { fulfillmentOrderId: string; lineItemId: string; quantity: number }[]>();
  const remainingDesired = new Map(desired.map((d) => [d.shopifyLineItemId, d.quantity]));

  for (const fo of fulfillmentOrders) {
    if (fo.status !== "OPEN" && fo.status !== "IN_PROGRESS" && fo.status !== "SCHEDULED") continue;
    for (const edge of fo.lineItems.edges) {
      const node = edge.node;
      const lineItemTail = idTail(node.lineItem.id);
      const want = remainingDesired.get(lineItemTail);
      if (!want || want <= 0 || node.remainingQuantity <= 0) continue;

      const take = Math.min(want, node.remainingQuantity);
      const list = byFulfillmentOrder.get(fo.id) ?? [];
      list.push({ fulfillmentOrderId: fo.id, lineItemId: node.id, quantity: take });
      byFulfillmentOrder.set(fo.id, list);
      remainingDesired.set(lineItemTail, want - take);
    }
  }

  return byFulfillmentOrder;
}

const FULFILLMENT_CREATE_MUTATION = `
  mutation($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

/**
 * Creates a real Shopify fulfillment for the given order's line items, with tracking info --
 * the actual Shopify-side effect of clicking "Markera som skickad" in Jawhara admin. Always
 * passes notifyCustomer: false: Jawhara's own branded Resend email (with the correct purchased-
 * variant images, which Shopify's own shipping notification can't show) is the one and only
 * shipping email for fulfillments created this way -- see lib/email/shipping-confirmation.ts and
 * its caller.
 *
 * Never throws: Shopify validation failures (nothing left to fulfill, an already-cancelled
 * fulfillment order, a malformed tracking URL, etc.) come back as a plain { ok: false, error }
 * the caller must treat as "did not fulfill" -- it must never write a local fulfillment row or
 * send a shipping email after this returns ok: false.
 */
export async function createShopifyFulfillment(input: {
  shopifyOrderId: string;
  lineItems: { shopifyLineItemId: string; quantity: number }[];
  trackingNumber?: string | null;
  trackingCompany?: string | null;
  trackingUrl?: string | null;
}): Promise<ShopifyFulfillmentResult> {
  try {
    const grouped = await resolveFulfillmentOrderLineItems(input.shopifyOrderId, input.lineItems);
    if (grouped.size === 0) {
      return { ok: false, error: "Inga artiklar kvar att leverera i Shopify (redan levererade eller borttagna)." };
    }

    const lineItemsByFulfillmentOrder = [...grouped.entries()].map(([fulfillmentOrderId, lines]) => ({
      fulfillmentOrderId,
      fulfillmentOrderLineItems: lines.map((l) => ({ id: l.lineItemId, quantity: l.quantity })),
    }));

    const trackingInfo =
      input.trackingNumber || input.trackingUrl
        ? {
            number: input.trackingNumber || undefined,
            company: input.trackingCompany || undefined,
            url: input.trackingUrl || undefined,
          }
        : undefined;

    const data = await shopifyGraphQL<{
      fulfillmentCreate: { fulfillment: { id: string; status: string } | null; userErrors: { field: string[]; message: string }[] };
    }>(FULFILLMENT_CREATE_MUTATION, {
      fulfillment: { lineItemsByFulfillmentOrder, notifyCustomer: false, trackingInfo },
    });

    const { fulfillment, userErrors } = data.fulfillmentCreate;
    if (userErrors.length > 0) {
      return { ok: false, error: userErrors.map((e) => e.message).join(" ") };
    }
    if (!fulfillment) {
      return { ok: false, error: "Shopify returnerade ingen leverans." };
    }
    return { ok: true, shopifyFulfillmentId: fulfillment.id, shopifyFulfillmentOrderId: null, status: fulfillment.status };
  } catch (err) {
    return { ok: false, error: `Shopify-fel: ${(err as Error).message}` };
  }
}

const FULFILLMENT_TRACKING_UPDATE_MUTATION = `
  mutation($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!) {
    fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: false) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

/** Edits tracking info on an existing Shopify fulfillment (the Shopify-side effect of editing
 * tracking details for an already-created fulfillment in Jawhara admin). notifyCustomer is
 * always false for the same reason as createShopifyFulfillment. */
export async function updateShopifyFulfillmentTracking(input: {
  shopifyFulfillmentId: string;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
  trackingUrl?: string | null;
}): Promise<ShopifyFulfillmentResult> {
  try {
    const data = await shopifyGraphQL<{
      fulfillmentTrackingInfoUpdate: { fulfillment: { id: string; status: string } | null; userErrors: { field: string[]; message: string }[] };
    }>(FULFILLMENT_TRACKING_UPDATE_MUTATION, {
      fulfillmentId: toGid("Fulfillment", input.shopifyFulfillmentId),
      trackingInfoInput: {
        number: input.trackingNumber || undefined,
        company: input.trackingCompany || undefined,
        url: input.trackingUrl || undefined,
      },
    });
    const { fulfillment, userErrors } = data.fulfillmentTrackingInfoUpdate;
    if (userErrors.length > 0) return { ok: false, error: userErrors.map((e) => e.message).join(" ") };
    if (!fulfillment) return { ok: false, error: "Shopify returnerade ingen leverans." };
    return { ok: true, shopifyFulfillmentId: fulfillment.id, shopifyFulfillmentOrderId: null, status: fulfillment.status };
  } catch (err) {
    return { ok: false, error: `Shopify-fel: ${(err as Error).message}` };
  }
}

const FULFILLMENT_CANCEL_MUTATION = `
  mutation($id: ID!) {
    fulfillmentCancel(id: $id) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

/** Cancels a Shopify fulfillment (Shopify reopens the affected fulfillment orders so the items
 * can be fulfilled again) -- the Shopify-side effect of a fulfillment cancellation in Jawhara
 * admin. */
export async function cancelShopifyFulfillment(shopifyFulfillmentId: string): Promise<ShopifyFulfillmentResult> {
  try {
    const data = await shopifyGraphQL<{
      fulfillmentCancel: { fulfillment: { id: string; status: string } | null; userErrors: { field: string[]; message: string }[] };
    }>(FULFILLMENT_CANCEL_MUTATION, { id: toGid("Fulfillment", shopifyFulfillmentId) });
    const { fulfillment, userErrors } = data.fulfillmentCancel;
    if (userErrors.length > 0) return { ok: false, error: userErrors.map((e) => e.message).join(" ") };
    if (!fulfillment) return { ok: false, error: "Shopify returnerade ingen leverans." };
    return { ok: true, shopifyFulfillmentId: fulfillment.id, shopifyFulfillmentOrderId: null, status: fulfillment.status };
  } catch (err) {
    return { ok: false, error: `Shopify-fel: ${(err as Error).message}` };
  }
}
