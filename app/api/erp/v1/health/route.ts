import { erpRoute } from "@/lib/erp/http";

export const dynamic = "force-dynamic";

/** GET /api/erp/v1/health -- checks the API key works. */
export const GET = erpRoute(async () => ({ body: { ok: true, api: "jawhara-erp", version: "v1", time: new Date().toISOString() } }));
