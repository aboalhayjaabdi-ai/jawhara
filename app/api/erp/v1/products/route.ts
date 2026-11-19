import { erpRoute, intParam, ErpError } from "@/lib/erp/http";
import { listProducts } from "@/lib/erp/products";

export const dynamic = "force-dynamic";

/** GET /api/erp/v1/products?offset=0&limit=100&sku=<sku>&updatedSince=<ISO> */
export const GET = erpRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const updatedSince = sp.get("updatedSince");
  if (updatedSince && Number.isNaN(new Date(updatedSince).getTime())) throw new ErpError(422, "invalid_updated_since", "updatedSince must be an ISO 8601 date-time.");
  return {
    body: await listProducts({ offset: intParam(sp.get("offset"), 0, 0, 100000), limit: intParam(sp.get("limit"), 100, 1, 250), sku: sp.get("sku"), updatedSince }),
  };
});
