import { paginateAll } from "./client";
import { upsertShopifyOrder, ORDER_FIELDS_FRAGMENT, type ShopifyOrderNode } from "./order-sync-shared";

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
 */
export async function syncOrdersFromShopify(): Promise<SyncOrdersResult> {
  const orders: ShopifyOrderNode[] = [];
  await paginateAll(QUERY, (d: any) => d.orders, async (nodes) => void orders.push(...(nodes as ShopifyOrderNode[])), 50);

  const errors: string[] = [];
  let importedCount = 0;

  for (const o of orders) {
    try {
      await upsertShopifyOrder(o);
      importedCount += 1;
    } catch (err) {
      errors.push(`${o.name}: ${(err as Error).message}`);
    }
  }

  return { pulledCount: orders.length, importedCount, errors };
}
