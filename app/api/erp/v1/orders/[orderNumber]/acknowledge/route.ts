import { erpRoute, normalizeOrderNumber, ErpError } from "@/lib/erp/http";
import { acknowledgeOrder } from "@/lib/erp/orders";

export const dynamic = "force-dynamic";

/** POST /api/erp/v1/orders/{orderNumber}/acknowledge  { "erpReference": "..." } */
export async function POST(req: Request, ctx: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await ctx.params;
  return erpRoute(
    async ({ body }) => {
      const ref = body?.erpReference;
      if (ref != null && (typeof ref !== "string" || ref.length > 200)) throw new ErpError(422, "invalid_erp_reference", "erpReference must be a string (max 200).");
      return { body: await acknowledgeOrder(normalizeOrderNumber(orderNumber), ref ?? null) };
    },
    { idempotent: true }
  )(req as any);
}
