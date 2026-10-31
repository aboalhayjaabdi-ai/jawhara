// Thin wrappers around window.fbq/window.gtag -- every call is a safe no-op when the script
// hasn't loaded (no consent yet, or no ID configured), since fbq/gtag then simply don't exist on
// window. No event is ever fired with invented data; every call site passes only real values
// already present in the page (real product/cart/order data).
import { logAnalyticsEvent } from "./first-party-analytics";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
  }
}

export function trackPageView() {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "PageView");
  window.gtag?.("event", "page_view");
  logAnalyticsEvent("page_view");
}

export function trackViewContent(params: { id: string; title: string; price: number; currency: string; productHandle?: string }) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "ViewContent", { content_ids: [params.id], content_name: params.title, content_type: "product", value: params.price, currency: params.currency });
  window.gtag?.("event", "view_item", { currency: params.currency, value: params.price, items: [{ item_id: params.id, item_name: params.title, price: params.price }] });
  logAnalyticsEvent("view_content", { productHandle: params.productHandle, productTitle: params.title });
}

export function trackAddToCart(params: { id: string; title: string; price: number; currency: string; quantity: number; productHandle?: string }) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "AddToCart", {
    content_ids: [params.id],
    content_name: params.title,
    content_type: "product",
    value: params.price * params.quantity,
    currency: params.currency,
  });
  window.gtag?.("event", "add_to_cart", {
    currency: params.currency,
    value: params.price * params.quantity,
    items: [{ item_id: params.id, item_name: params.title, price: params.price, quantity: params.quantity }],
  });
  logAnalyticsEvent("add_to_cart", { productHandle: params.productHandle, productTitle: params.title });
}

export function trackInitiateCheckout(params: {
  value: number;
  currency: string;
  itemCount: number;
  // One per distinct cart line, products.id (same id used as retailer_id in the Meta catalog --
  // see lib/queries.ts's ProductCard.id) -- without these Meta can't tie an abandoned cart back
  // to the real catalog items for retargeting, same gap trackViewContent/trackAddToCart had.
  contents: { id: string; quantity: number }[];
}) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "InitiateCheckout", {
    content_ids: params.contents.map((c) => c.id),
    contents: params.contents,
    content_type: "product",
    value: params.value,
    currency: params.currency,
    num_items: params.itemCount,
  });
  window.gtag?.("event", "begin_checkout", { value: params.value, currency: params.currency });
  logAnalyticsEvent("initiate_checkout");
}

/** `eventId` is the same value sent to the server-side Conversions API call for this same
 * purchase (the Stripe Checkout session ID) -- required for Meta to deduplicate the browser
 * pixel event against the server event instead of double-counting one real purchase. */
export function trackPurchase(params: { eventId: string; orderNumber: string; value: number; currency: string }) {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "Purchase", { value: params.value, currency: params.currency, content_name: params.orderNumber }, { eventID: params.eventId });
  window.gtag?.("event", "purchase", { transaction_id: params.orderNumber, value: params.value, currency: params.currency });
}
