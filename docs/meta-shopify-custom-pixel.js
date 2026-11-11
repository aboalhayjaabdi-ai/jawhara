// Jawhara – Meta-pixel för Shopify-kassan (AddPaymentInfo + Purchase)
// ====================================================================
// Klistras in i Shopify admin: Inställningar → Kundhändelser → Lägg till anpassad pixel
// (namn t.ex. "Meta Purchase"). Behörighet: "Krävs inte" – koden kontrollerar själv samtycket
// (se nedan). Dataförsäljning: "Data collected qualifies as data sale".
// Spara och klicka på "Anslut".
//
// Varför: kassan ligger på jawharastore.se där jawhara.se:s pixel inte finns, så Meta fick bara
// Purchase från servern (Conversions API). Den här koden skickar samma Purchase från webbläsaren
// med SAMMA event-ID som servern (shopify_order_<order-id>, se lib/marketing/capi-purchase.ts) så
// att Meta slår ihop dem till ett köp i stället för att räkna dubbelt.
//
// Samtycke: skickas bara om kunden godkände cookies på jawhara.se (cart-attributet _jw_consent,
// satt av app/api/shopify-cart/sync) eller om Shopifys egen cookie-banner gav marknadsförings-
// samtycke.

const PIXEL_ID = "1327573046018053";

function attr(checkout, key) {
  const a = (checkout.attributes || []).find((x) => x.key === key);
  return a ? a.value : null;
}

function hasConsent(checkout) {
  const fromSite = attr(checkout, "_jw_consent") === "marketing";
  const fromShopify = !!(init.customerPrivacy && init.customerPrivacy.marketingAllowed);
  return fromSite || fromShopify;
}

function tail(id) {
  return id ? String(id).split("/").pop() : null;
}

let pixelReady = false;

// Laddar Meta-pixeln en gång och skickar med kunddata (avancerad matchning – pixeln hashar
// värdena själv). external_id = besökar-ID från jawhara.se, samma som sajtens händelser har.
function initPixel(checkout) {
  if (pixelReady) return;
  pixelReady = true;

  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');

  const addr = checkout.shippingAddress || checkout.billingAddress || {};
  const matching = {};
  if (checkout.email) matching.em = checkout.email.trim().toLowerCase();
  const phone = checkout.phone || addr.phone || (checkout.billingAddress && checkout.billingAddress.phone);
  if (phone) {
    let p = String(phone).replace(/[^\d+]/g, "");
    if (p.startsWith("+")) p = p.slice(1);
    else if (p.startsWith("00")) p = p.slice(2);
    else if (p.startsWith("0") && (addr.countryCode || "SE") === "SE") p = "46" + p.slice(1);
    matching.ph = p.replace(/\D/g, "");
  }
  if (addr.firstName) matching.fn = addr.firstName.trim().toLowerCase();
  if (addr.lastName) matching.ln = addr.lastName.trim().toLowerCase();
  if (addr.city) matching.ct = addr.city.trim().toLowerCase().replace(/\s+/g, "");
  if (addr.zip) matching.zp = addr.zip.replace(/\s+/g, "").toLowerCase();
  if (addr.countryCode) matching.country = addr.countryCode.toLowerCase();
  const visitorId = attr(checkout, "_jw_vid");
  if (visitorId) matching.external_id = visitorId;

  fbq("init", PIXEL_ID, matching);
}

// Samma content_ids som servern skickar (Jawharas produkt-ID = katalogens retailer_id),
// medskickade från jawhara.se som cart-attributet _jw_contents ("id:antal,id:antal").
function cartParams(checkout) {
  const contents = (attr(checkout, "_jw_contents") || "")
    .split(",")
    .map((pair) => pair.split(":"))
    .filter((p) => p[0] && Number(p[1]) > 0)
    .map((p) => ({ id: p[0], quantity: Number(p[1]) }));
  const params = {
    value: Number(checkout.totalPrice && checkout.totalPrice.amount) || 0,
    currency: checkout.currencyCode || "SEK",
    content_type: "product",
  };
  if (contents.length > 0) {
    params.contents = contents;
    params.content_ids = contents.map((c) => c.id);
    params.num_items = contents.reduce((s, c) => s + c.quantity, 0);
  }
  return params;
}

// Kunden har fyllt i betalningsuppgifter.
analytics.subscribe("payment_info_submitted", (event) => {
  const checkout = event.data.checkout;
  if (!checkout || !hasConsent(checkout)) return;
  initPixel(checkout);
  fbq("track", "AddPaymentInfo", cartParams(checkout), { eventID: "payinfo_" + (checkout.token || Date.now()) });
});

// Köpet. Samma event-ID som servern skickar (shopify_order_<order-id>) så att Meta slår ihop dem.
analytics.subscribe("checkout_completed", (event) => {
  const checkout = event.data.checkout;
  if (!checkout || !hasConsent(checkout)) return;
  const orderId = tail(checkout.order && checkout.order.id);
  if (!orderId) return;
  initPixel(checkout);
  fbq("track", "Purchase", cartParams(checkout), { eventID: "shopify_order_" + orderId });
});
