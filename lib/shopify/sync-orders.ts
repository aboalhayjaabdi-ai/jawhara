import { paginateAll } from "./client";
import { upsertShopifyOrder, ORDER_FIELDS_FRAGMENT, type ShopifyOrderNode } from "./order-sync-shared";
import { reportNewlyPaidPurchase, maybeSendCancellationEmail } from "./sync-side-effects";

// How far back a recovered order's own processed/created date may be for this sweep to still
// treat it as "newly" paid/cancelled and act on it (report to Meta, send the cancellation email).
// Bounds the blast radius of a reconciliation run to genuinely-missed recent events, never to
// old orders the initial historical backfill already accounted for.
const RECOVERY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/sync-orders.ts must never be imported into client code");
}

export interface SyncOrdersResult {
  pulledCount: number;
  importedCount: number;
  errors: string[];
}

const QUERY = `
  query($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      edges {
        cursor
        node { ${ORDER_FIELDS_FRAGMENT} }
      }
      pageInfo { hasNextPage }
    }
  }
`;

/**
 * Next.js-native equivalent of scripts/shopify/import-missing-orders.ts, callable from the admin
 * "Sync from Shopify" button (app/api/admin/orders/sync/route.ts). Same idempotent shopify_id-
 * keyed upsert pipeline as app/api/webhooks/shopify/route.ts's real-time path (both now go
 * through upsertShopifyOrder) -- this one is the periodic/manual catch-all sweep, the webhook is
 * what keeps things current in real time. Runs on this app's own, restricted (read_orders-only)
 * Shopify token in production -- it only ever sees orders from the last ~60 days (see
 * docs/order-reconciliation-report.md §4), so it catches new orders going forward; it does not
 * redo the one-time historical backfill that import-mcp-backfill-orders.ts already did once.
 *
 * `recoverMissedEvents`: only the reconciliation cron (app/api/cron/sync-orders/route.ts) passes
 * true. When set, any order found newly paid/cancelled AND processed within the last
 * RECOVERY_WINDOW_MS also gets the same Meta Purchase report / cancellation email the real-time
 * webhook would have sent -- safe to call repeatedly: both go through the same atomic-claim
 * columns the webhook path uses, so an order the webhook already handled is a no-op here, and one
 * it missed gets handled exactly once. The admin's manual "Sync from Shopify" button keeps its
 * original data-only behavior (default false), unchanged.
 */
export async function syncOrdersFromShopify(recoverMissedEvents = false): Promise<SyncOrdersResult> {
  const orders: ShopifyOrderNode[] = [];
  await paginateAll(QUERY, (d: any) => d.orders, async (nodes) => void orders.push(...(nodes as ShopifyOrderNode[])), 50);

  const errors: string[] = [];
  let importedCount = 0;

  for (const o of orders) {
    try {
      const result = await upsertShopifyOrder(o);
      importedCount += 1;

      if (recoverMissedEvents) {
        const referenceDate = o.processedAt ?? o.createdAt;
        const isRecent = referenceDate && Date.now() - new Date(referenceDate).getTime() < RECOVERY_WINDOW_MS;
        if (isRecent) {
          if (result.isNewlyPaid) await reportNewlyPaidPurchase(result.orderId);
          if (result.isNewlyCancelled) await maybeSendCancellationEmail(result.orderId);
        }
      }
    } catch (err) {
      errors.push(`${o.name}: ${(err as Error).message}`);
    }
  }

  return { pulledCount: orders.length, importedCount, errors };
}
