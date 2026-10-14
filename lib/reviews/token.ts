import crypto from "crypto";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/token.ts must never be imported into client code");
}

// Same pattern as lib/tracking/token.ts: HMAC-signed with the existing service-role secret
// rather than a new credential, so a customer can submit a review for the exact product they
// bought without ever logging in.
function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing required env var SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

const DEFAULT_TTL_DAYS = 90;

export function createReviewToken(orderId: string, productId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = `${orderId}.${productId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`, "utf-8").toString("base64url");
}

export function verifyReviewToken(token: string): { orderId: string; productId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [orderId, productId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!orderId || !productId || !Number.isFinite(exp) || Date.now() > exp) return null;

    const expectedSig = crypto.createHmac("sha256", secret()).update(`${orderId}.${productId}.${expStr}`).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    return { orderId, productId };
  } catch {
    return null;
  }
}

/** Links straight to the product page, auto-opening the pre-verified review form -- no order
 * number/email re-entry needed, same UX principle as the tracking-link token. */
export function buildReviewLinkUrl(productHandle: string, orderId: string, productId: string, siteUrl: string): string {
  const token = createReviewToken(orderId, productId);
  return `${siteUrl}/produkter/${productHandle}?review_token=${token}#skriv-recension`;
}
