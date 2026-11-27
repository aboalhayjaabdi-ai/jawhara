import { supabaseService } from "@/lib/supabase/service-client";
import { shopifyGraphQL } from "@/lib/shopify/client";
import { orderStores } from "@/lib/shopify/stores";
import { sendEmail } from "./send";
import { getOrderItemImages } from "@/lib/order-images";
import { buildTrackingLinkUrl } from "@/lib/tracking/token";

if (typeof window !== "undefined") {
  throw new Error("lib/email/delay-notice.ts must never be imported into client code");
}

/**
 * "Din beställning är försenad" -- an apology with a discount code, sent by hand from Admin →
 * Förseningar. The page lists shipped orders whose latest delivery date (the range Shopify shows
 * on the order) is tomorrow or has passed; whether a parcel has actually arrived is checked by a
 * person on 17TRACK's website before the e-mail is sent -- never by an API. Each order gets it at
 * most once (audit_log, like the delivery-check e-mail).
 */
export const DELAY_NOTICE_CODE = "RABATT20";
export const DELAY_NOTICE_CODE_VALID_TO = "31 december";
const SENT_ACTION = "email.delay_notice_sent";
const ORDERS_FROM = "2026-10-20T00:00:00+02:00";
/** Orders this many days past their latest delivery date are no longer listed. */
const MAX_DAYS_LATE = 30;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
const DAY_MS = 86_400_000;

export type DelayCandidate = {
  orderId: string;
  orderNumber: string;
  email: string | null;
  customerName: string;
  orderedAt: string;
  latestDelivery: string; // YYYY-MM-DD, Swedish date
  daysLate: number; // negative = days left
  trackingNumbers: string[];
  trackingUrl17: string;
};

const stockholmDate = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const dayNumber = (ymd: string) => Math.round(new Date(`${ymd}T00:00:00Z`).getTime() / DAY_MS);

const ORDERS_QUERY = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Order { id fulfillmentOrders(first:5){ nodes { deliveryMethod { maxDeliveryDateTime } } } fulfillments(first:10){ displayStatus } } } }`;

/** Latest delivery date (Stockholm) and whether Shopify itself already shows the order as delivered. */
async function shopifyDeliveryInfo(shopifyIds: string[]): Promise<Map<string, { max: string | null; delivered: boolean }>> {
  const out = new Map<string, { max: string | null; delivered: boolean }>();
  let missing = [...new Set(shopifyIds)];
  for (const store of orderStores()) {
    const next: string[] = [];
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const data = await shopifyGraphQL<{ nodes: any[] }>(ORDERS_QUERY, { ids: chunk.map((id) => `gid://shopify/Order/${id}`) }, store).catch(() => ({ nodes: [] as any[] }));
      chunk.forEach((id, j) => {
        const n = data.nodes[j];
        if (!n) return void next.push(id);
        const maxes = (n.fulfillmentOrders?.nodes ?? []).map((f: any) => f.deliveryMethod?.maxDeliveryDateTime).filter(Boolean).sort();
        const fs = n.fulfillments ?? [];
        out.set(id, { max: maxes.length ? stockholmDate(maxes.at(-1)) : null, delivered: fs.length > 0 && fs.every((f: any) => f.displayStatus === "DELIVERED") });
      });
    }
    missing = next;
    if (!missing.length) break;
  }
  return out;
}

/** Shipped orders whose latest delivery date is tomorrow or has passed, not delivered in Shopify, not yet e-mailed. */
export async function listDelayCandidates(now: Date = new Date()): Promise<DelayCandidate[]> {
  const { data, error } = await supabaseService
    .from("orders")
    .select("id, order_number, email, created_at, shopify_id, financial_status, cancelled_at, is_test_order, hidden_at, shipping_address_id, fulfillments(tracking_number, status)")
    .gte("created_at", ORDERS_FROM)
    .not("shopify_id", "is", null)
    .order("created_at");
  if (error) throw new Error(`Could not load orders: ${error.message}`);
  const shipped = (data ?? []).filter(
    (o: any) =>
      !o.cancelled_at && !o.is_test_order && !o.hidden_at &&
      ["paid", "partially_refunded"].includes(String(o.financial_status ?? "").toLowerCase()) &&
      (o.fulfillments ?? []).some((f: any) => f.tracking_number && String(f.status ?? "").toUpperCase() !== "CANCELLED")
  );
  if (!shipped.length) return [];

  const sent = new Set<string>();
  const ids = shipped.map((o: any) => o.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: logged } = await supabaseService.from("audit_log").select("entity_id").eq("action", SENT_ACTION).eq("entity_type", "order").in("entity_id", ids.slice(i, i + 200));
    for (const l of logged ?? []) if (l.entity_id) sent.add(l.entity_id);
  }
  const open = shipped.filter((o: any) => !sent.has(o.id));
  const info = await shopifyDeliveryInfo(open.map((o: any) => String(o.shopify_id)));
  const today = dayNumber(stockholmDate(now));

  const addressIds = open.map((o: any) => o.shipping_address_id).filter(Boolean);
  const { data: addresses } = addressIds.length ? await supabaseService.from("addresses").select("id, first_name, last_name").in("id", addressIds) : { data: [] as any[] };
  const nameOf = new Map((addresses ?? []).map((a: any) => [a.id, [a.first_name, a.last_name].filter(Boolean).join(" ")]));

  const out: DelayCandidate[] = [];
  for (const o of open as any[]) {
    const i = info.get(String(o.shopify_id));
    if (!i?.max || i.delivered) continue;
    const daysLate = today - dayNumber(i.max);
    if (daysLate < -1 || daysLate > MAX_DAYS_LATE) continue; // due from the day before the latest date
    const tns = (o.fulfillments ?? []).filter((f: any) => f.tracking_number && String(f.status ?? "").toUpperCase() !== "CANCELLED").map((f: any) => f.tracking_number as string);
    out.push({
      orderId: o.id,
      orderNumber: o.order_number,
      email: o.email,
      customerName: nameOf.get(o.shipping_address_id) ?? "",
      orderedAt: stockholmDate(o.created_at),
      latestDelivery: i.max,
      daysLate,
      trackingNumbers: tns,
      trackingUrl17: `https://t.17track.net/sv#nums=${tns.join(",")}`,
    });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate || a.orderNumber.localeCompare(b.orderNumber));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const small = (u: string | null) => (u ? u.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=160&height=160&resize=contain" : null);

async function buildDelayNotice(orderId: string) {
  const { data: o } = await supabaseService
    .from("orders")
    .select("id, order_number, email, shipping_address_id, order_items(id, title, variant_title_snapshot, quantity, refunded_quantity, variant_id, product_id)")
    .eq("id", orderId)
    .single();
  if (!o) throw new Error("Ordern hittades inte.");
  const { data: a } = o.shipping_address_id ? await supabaseService.from("addresses").select("first_name").eq("id", o.shipping_address_id).maybeSingle() : { data: null };
  const first = (a?.first_name ?? "").trim().split(/\s+/)[0];
  const name = first ? first[0].toLocaleUpperCase("sv-SE") + first.slice(1).toLocaleLowerCase("sv-SE") : "";
  const items = ((o.order_items ?? []) as any[]).filter((i) => !/presentask/i.test(i.title ?? "") && i.quantity - (i.refunded_quantity ?? 0) > 0);
  const imgs = await getOrderItemImages(items.map((i) => ({ id: i.id, variantId: i.variant_id, productId: i.product_id })));
  const rows = items
    .map((i) => {
      const img = small(imgs[i.id]?.imageUrl ?? null);
      const variant = i.variant_title_snapshot && !/default title/i.test(i.variant_title_snapshot) ? `<br/><span style="color:#666;font-size:12px;">${esc(i.variant_title_snapshot)}</span>` : "";
      const qty = i.quantity > 1 ? `<br/><span style="color:#666;font-size:12px;">Antal: ${i.quantity}</span>` : "";
      return `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 12px 8px 0;width:64px;" valign="top">${img ? `<img src="${esc(img)}" width="64" height="64" alt="${esc(i.title)}" style="display:block;width:64px;height:64px;border:0;background:#f4f4f4;" />` : ""}</td><td style="padding:8px 0;font-size:14px;" valign="middle">${esc(i.title)}${variant}${qty}</td></tr>`;
    })
    .join("");
  const subject = `Din beställning ${o.order_number} är försenad – vi ber om ursäkt`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111;">
      <div style="text-align:center;padding:24px 0 8px;"><span style="font-size:20px;letter-spacing:0.1em;font-weight:600;">JAWHARA</span></div>
      <h1 style="font-size:18px;font-weight:600;margin:24px 0 8px;">Din beställning är försenad</h1>
      <p style="font-size:14px;line-height:1.6;">Hej${name ? " " + esc(name) : ""}!</p>
      <p style="font-size:14px;line-height:1.6;">Din beställning <strong>${esc(o.order_number)}</strong> är skickad, men leveransen har tyvärr blivit försenad och tar längre tid än vanligt. Vi ber verkligen om ursäkt för det.</p>
      <p style="font-size:14px;line-height:1.6;">Ditt paket är på väg och vi följer det tills det har kommit fram till dig.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;background:#f7f5f2;border:1px solid #ece8e2;"><tr><td align="center" style="padding:18px 20px;">
        <div style="font-size:13px;color:#444;margin-bottom:6px;">Som tack för ditt tålamod får du <strong>20 % rabatt</strong> på ditt nästa köp med koden</div>
        <div style="font-size:22px;font-weight:600;letter-spacing:0.12em;font-family:'Courier New',Courier,monospace;">${DELAY_NOTICE_CODE}</div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Ange koden i kassan. Gäller till och med ${DELAY_NOTICE_CODE_VALID_TO}.</div>
      </td></tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0 8px;"><tr><td align="center">
        <a href="${esc(buildTrackingLinkUrl(o.id, SITE_URL))}" style="display:block;background:#111;color:#fff;text-decoration:none;text-transform:uppercase;letter-spacing:0.08em;font-size:13px;font-weight:600;padding:16px 28px;text-align:center;">Spåra din beställning</a>
      </td></tr></table>
      <p style="font-size:14px;line-height:1.6;margin-top:24px;">Har du frågor? Svara bara på det här mejlet så hjälper vi dig.</p>
      <p style="margin-top:32px;color:#666;font-size:13px;">Med vänliga hälsningar,<br/>Jawhara<br/><a href="mailto:support@jawhara.se" style="color:#111;">support@jawhara.se</a></p>
    </div>`;
  return { email: o.email as string | null, orderNumber: o.order_number as string, subject, html };
}

export type DelayNoticeResult = { ok: true; orderNumber: string } | { ok: false; orderNumber?: string; error: string };

/** Sends the e-mail for one order, at most once (the mark is removed again if Resend rejects it). */
export async function sendDelayNotice(orderId: string, adminId: string | null): Promise<DelayNoticeResult> {
  const { data: already } = await supabaseService.from("audit_log").select("id").eq("action", SENT_ACTION).eq("entity_type", "order").eq("entity_id", orderId).limit(1);
  if (already?.length) return { ok: false, error: "Förseningsmejlet är redan skickat för den här ordern." };
  const notice = await buildDelayNotice(orderId);
  if (!notice.email) return { ok: false, orderNumber: notice.orderNumber, error: "Ordern saknar e-postadress." };
  const { data: marks, error: markError } = await supabaseService
    .from("audit_log")
    .insert({ actor_id: adminId, action: SENT_ACTION, entity_type: "order", entity_id: orderId, detail: { orderNumber: notice.orderNumber, code: DELAY_NOTICE_CODE } })
    .select("id");
  if (markError) return { ok: false, orderNumber: notice.orderNumber, error: "Kunde inte registrera utskicket." };
  const sent = await sendEmail({ to: notice.email, subject: notice.subject, html: notice.html, replyTo: "support@jawhara.se" }, { idempotencyKey: `delay-notice-${orderId}` });
  if (!sent.ok) {
    await supabaseService.from("audit_log").delete().in("id", (marks ?? []).map((m) => m.id));
    return { ok: false, orderNumber: notice.orderNumber, error: sent.error };
  }
  return { ok: true, orderNumber: notice.orderNumber };
}

/** A copy of one order's e-mail to another address (preview), recording nothing. */
export async function sendDelayNoticeTest(orderId: string, to: string): Promise<DelayNoticeResult> {
  const notice = await buildDelayNotice(orderId);
  const sent = await sendEmail({ to, subject: `[TEST] ${notice.subject}`, html: notice.html, replyTo: "support@jawhara.se" });
  return sent.ok ? { ok: true, orderNumber: notice.orderNumber } : { ok: false, orderNumber: notice.orderNumber, error: sent.error };
}
