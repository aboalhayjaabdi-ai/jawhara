// Pure substitution helper, safe for both client and server code (no DB access, no server-only
// guard) -- used by the admin fulfillment form (client) to auto-fill a tracking URL from a
// carrier's saved template, and re-exported from the server-only lib/admin/shipping-carriers.ts
// for any future server-side use.
export function buildTrackingUrl(template: string | null, trackingNumber: string): string | null {
  if (!template || !trackingNumber) return null;
  return template.replace(/\{trackingNumber\}/g, encodeURIComponent(trackingNumber));
}
