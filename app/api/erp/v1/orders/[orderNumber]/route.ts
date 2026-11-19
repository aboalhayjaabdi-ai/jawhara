import { erpRoute, normalizeOrderNumber } from "@/lib/erp/http";
import { getErpOrder } from "@/lib/erp/orders";

export const dynamic = "force-dynamic";

/** GET /api/erp/v1/orders/{orderNumber} -- one order in any state ("SE104239" or "%23SE104239"). */
export async function GET(req: Request, ctx: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await ctx.params;
  return erpRoute(async () => ({ body: await getErpOrder(normalizeOrderNumber(orderNumber)) }))(req as any);
}
