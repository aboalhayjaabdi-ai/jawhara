import crypto from "crypto";

if (typeof window !== "undefined") {
  throw new Error("lib/tracking/token.ts must never be imported into client code");
}

// Signs with the existing service-role secret (server-only, never reaches the client) rather
// than introducing a new credential the user would have to configure -- an HMAC derived key,
// same pattern as any "sign with an existing server secret" scheme.
function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing required env var SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

const DEFAULT_TTL_DAYS = 45;

/** The token encodes only the order id and an expiry -- never the customer's email or any other
 * PII -- so the URL itself discloses nothing if intercepted or logged. */
export function createTrackingToken(orderId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = `${orderId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`, "utf-8").toString("base64url");
}

export function verifyTrackingToken(token: string): { orderId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [orderId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!orderId || !Number.isFinite(exp) || Date.now() > exp) return null;

    const expectedSig = crypto.createHmac("sha256", secret()).update(`${orderId}.${expStr}`).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    return { orderId };
  } catch {
    return null;
  }
}

export function buildTrackingLinkUrl(orderId: string, siteUrl: string): string {
  const token = createTrackingToken(orderId);
  return `${siteUrl}/sparra-mitt-paket?token=${token}`;
}
