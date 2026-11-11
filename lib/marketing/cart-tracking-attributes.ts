// Cart attribute keys used to carry Meta tracking data from www.jawhara.se across to Shopify's own
// checkout domain (jawharastore.se), where none of this site's cookies or localStorage exist.
//
// Shopify copies cart attributes onto the order (Order.customAttributes, read back by
// lib/marketing/capi-purchase.ts for the server-side Conversions API Purchase) and exposes them to
// the checkout's custom web pixel as checkout.attributes (docs/meta-shopify-custom-pixel.js, the
// browser-side Purchase). The leading "_" hides them from the customer in checkout.
//
// The marketing keys are only ever set when the visitor accepted the cookie banner on jawhara.se --
// _jw_consent is how the checkout pixel knows that consent was given on the other domain.
export const ATTR_CONSENT = "_jw_consent";
export const ATTR_FBP = "_fbp";
export const ATTR_FBC = "_fbc";
export const ATTR_USER_AGENT = "_jw_ua";
// First-party visitor id (lib/marketing/first-party-analytics.ts) -- the same external_id the
// site's browser and server events carry, so Meta links the Purchase to the visitor's earlier
// PageView/ViewContent/AddToCart events.
export const ATTR_VISITOR = "_jw_vid";
// "productUuid:qty,productUuid:qty" -- Jawhara products.id, the same id the Meta catalog uses as
// retailer_id (see capi-purchase.ts). Lets the checkout pixel's browser Purchase carry the same
// content_ids as the server event; the checkout itself only knows Shopify's own product ids.
export const ATTR_CONTENTS = "_jw_contents";

export const MANAGED_ATTRIBUTE_KEYS = [ATTR_CONSENT, ATTR_FBP, ATTR_FBC, ATTR_USER_AGENT, ATTR_VISITOR, ATTR_CONTENTS];

export type ClientTrackingInput = { consent: boolean; fbp: string | null; fbc: string | null; visitorId: string | null };

const FBP_RE = /^fb\.\d\.\d{10,13}\.\d{1,30}$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_\-]{1,500}$/;

/** Validates untrusted browser input -- anything malformed is dropped, never forwarded to Meta. */
export function parseClientTracking(raw: unknown): ClientTrackingInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const consent = r.consent === true;
  const fbp = consent && typeof r.fbp === "string" && FBP_RE.test(r.fbp) ? r.fbp : null;
  const fbc = consent && typeof r.fbc === "string" && FBC_RE.test(r.fbc) ? r.fbc : null;
  const visitorId = consent && typeof r.visitorId === "string" && /^[A-Za-z0-9\-]{8,64}$/.test(r.visitorId) ? r.visitorId : null;
  return { consent, fbp, fbc, visitorId };
}

export function buildTrackingAttributes(input: ClientTrackingInput, userAgent: string | null): Record<string, string> {
  if (!input.consent) return {};
  const attrs: Record<string, string> = { [ATTR_CONSENT]: "marketing" };
  if (input.fbp) attrs[ATTR_FBP] = input.fbp;
  if (input.fbc) attrs[ATTR_FBC] = input.fbc;
  if (input.visitorId) attrs[ATTR_VISITOR] = input.visitorId;
  if (userAgent) attrs[ATTR_USER_AGENT] = userAgent.slice(0, 500);
  return attrs;
}

export function attributeMap(attributes: { key: string; value: string | null }[] | null | undefined): Map<string, string> {
  return new Map((attributes ?? []).filter((a) => a.value).map((a) => [a.key, a.value as string]));
}
