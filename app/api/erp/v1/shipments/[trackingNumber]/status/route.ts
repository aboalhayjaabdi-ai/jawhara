import { erpRoute } from "@/lib/erp/http";
import { updateShipmentStatus } from "@/lib/erp/shipments";

export const dynamic = "force-dynamic";

/** POST /api/erp/v1/shipments/{trackingNumber}/status  { status, occurredAt?, message?, dryRun? } */
export async function POST(req: Request, ctx: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await ctx.params;
  return erpRoute(async ({ body }) => updateShipmentStatus(trackingNumber, body), { idempotent: true })(req as any);
}
