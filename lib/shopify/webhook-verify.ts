import { createHmac, timingSafeEqual } from "crypto";

if (typeof window !== "undefined") {
  throw new Error("lib/shopify/webhook-verify.ts must never be imported into client code");
}

/**
 * Verifies a Shopify webhook's HMAC-SHA256 signature against this app's own client secret --
 * the same secret used to mint the Admin API access token (lib/shopify/client.ts), which is
 * exactly what Shopify signs webhook deliveries with for a custom (non-public) app. Must run
 * against the raw, unparsed request body: any re-serialization (even formatting-only) produces
 * a different signature.
 */
export function verifyShopifyWebhookSignature(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");
  const givenBuf = Buffer.from(hmacHeader, "base64");
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}
