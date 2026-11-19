import { erpRoute, intParam, ErpError } from "@/lib/erp/http";
import { listReadyOrders } from "@/lib/erp/orders";

export const dynamic = "force-dynamic";

/** GET /api/erp/v1/orders?exportState=new|acknowledged|all&since=<cursor>&limit=50 */
export const GET = erpRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const exportState = (sp.get("exportState") ?? "new") as "new" | "acknowledged" | "all";
  if (!["new", "acknowledged", "all"].includes(exportState)) throw new ErpError(422, "invalid_export_state", "exportState must be new, acknowledged or all.");
  const since = sp.get("since");
  if (since && Number.isNaN(new Date(since).getTime())) throw new ErpError(422, "invalid_since", "since must be an ISO 8601 date-time (use nextCursor).");
  return { body: await listReadyOrders({ exportState, since, limit: intParam(sp.get("limit"), 50, 1, 100), includeTest: sp.get("includeTest") === "true" }) };
});
