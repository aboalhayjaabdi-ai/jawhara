import { erpRoute } from "@/lib/erp/http";
import { createShipment } from "@/lib/erp/shipments";

export const dynamic = "force-dynamic";

/** POST /api/erp/v1/shipments  { orderNumber, trackingNumber, carrier?, trackingUrl?, items?, dryRun? } */
export const POST = erpRoute(async ({ body }) => createShipment(body), { idempotent: true });
