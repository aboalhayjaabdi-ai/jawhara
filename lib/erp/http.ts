import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/erp/http.ts must never be imported into client code");
}

/**
 * Shared plumbing for the freight forwarder's ERP API (app/api/erp/v1/*): API-key authentication,
 * an optional IP allowlist, a request id on every response, JSON errors, a log row per call (no
 * customer data in it) and Idempotency-Key replay for POSTs, so a retried request never acts twice.
 *
 * Secrets live in Vercel environment variables:
 *   ERP_API_KEYS     comma-separated keys accepted as "Authorization: Bearer <key>" (several, so a
 *                    key can be rotated without downtime). Unset = the whole API answers 503.
 *   ERP_ALLOWED_IPS  optional comma-separated client IPs; unset = any IP with a valid key.
 */

export class ErpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

type Ctx = { req: NextRequest; requestId: string; body: any };
type Handler = (ctx: Ctx) => Promise<{ status?: number; body: unknown }>;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authenticate(req: NextRequest): void {
  const keys = (process.env.ERP_API_KEYS ?? "").split(",").map((k) => k.trim()).filter((k) => k.length >= 32);
  if (keys.length === 0) throw new ErpError(503, "not_configured", "The ERP API is not configured.");
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !keys.some((k) => keyMatches(given, k))) throw new ErpError(401, "unauthorized", "Missing or invalid API key.");
  const allowed = (process.env.ERP_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(clientIp(req))) throw new ErpError(403, "ip_not_allowed", "This IP address is not allowed.");
}

async function logRequest(row: Record<string, unknown>): Promise<void> {
  try {
    await supabaseService.from("erp_api_requests").insert(row);
  } catch (err) {
    console.error("ERP API log failed:", (err as Error).message);
  }
}

function json(status: number, body: unknown, requestId: string): NextResponse {
  return NextResponse.json(body, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
}

export function erpRoute(handler: Handler, options: { idempotent?: boolean } = {}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const started = Date.now();
    const requestId = randomUUID();
    const path = new URL(req.url).pathname;
    const idempotencyKey = options.idempotent ? req.headers.get("idempotency-key")?.trim().slice(0, 200) || null : null;
    const base = { request_id: requestId, method: req.method, path, ip: clientIp(req), idempotency_key: idempotencyKey };
    try {
      authenticate(req);

      if (idempotencyKey) {
        const { data: previous } = await supabaseService
          .from("erp_api_requests")
          .select("status, response")
          .eq("method", req.method)
          .eq("path", path)
          .eq("idempotency_key", idempotencyKey)
          .lt("status", 500)
          .not("response", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (previous) {
          const res = json(previous.status ?? 200, previous.response, requestId);
          res.headers.set("Idempotent-Replay", "true");
          // Logged without the key (the unique index holds the original call's row).
          await logRequest({ ...base, idempotency_key: null, status: previous.status, duration_ms: Date.now() - started, error: `idempotent replay of ${idempotencyKey}` });
          return res;
        }
      }

      let body: any = null;
      if (req.method === "POST") {
        const text = await req.text();
        if (text.length > 100_000) throw new ErpError(413, "payload_too_large", "Request body too large.");
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new ErpError(400, "invalid_json", "Request body must be JSON.");
        }
      }

      const result = await handler({ req, requestId, body });
      const status = result.status ?? 200;
      const responseBody = { ...(result.body as object), requestId };
      await logRequest({ ...base, status, duration_ms: Date.now() - started, response: idempotencyKey && status < 500 ? responseBody : null });
      return json(status, responseBody, requestId);
    } catch (err) {
      const e = err instanceof ErpError ? err : new ErpError(500, "internal_error", "Internal error. Safe to retry.");
      if (!(err instanceof ErpError)) console.error(`ERP API ${req.method} ${path} failed:`, err);
      const responseBody = { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) }, requestId };
      await logRequest({
        ...base,
        status: e.status,
        duration_ms: Date.now() - started,
        error: err instanceof ErpError ? `${e.code}: ${e.message}` : String((err as Error)?.message ?? err).slice(0, 500),
        // A definitive answer (4xx) to an idempotent request is replayed too; a 5xx is retryable.
        response: idempotencyKey && e.status < 500 && e.status !== 401 && e.status !== 403 ? responseBody : null,
      });
      return json(e.status, responseBody, requestId);
    }
  };
}

/** "#SE104239", "SE104239" or "%23SE104239" -> "#SE104239". */
export function normalizeOrderNumber(raw: string): string {
  const s = decodeURIComponent(raw).trim().toUpperCase();
  return s.startsWith("#") ? s : `#${s}`;
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
