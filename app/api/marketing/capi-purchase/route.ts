import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseService } from "@/lib/supabase/service-client";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Server-side Meta Conversions API "Purchase" event -- deliberately NOT part of
 * app/api/webhooks/stripe/route.ts (never edited per standing project rules). Called from the
 * already-unprotected confirmation page (app/(storefront)/kassa/bekraftelse/page.tsx) once that
 * page has confirmed payment via the existing /api/checkout/session route.
 *
 * Every value sent to Meta is re-derived here from the real `orders` row by the Stripe session id
 * -- never trusted from the request body -- so a tampered client request can at most replay a
 * real paid order's own real total, never invent one.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  if (!sessionId) return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });

  const { data: order } = await supabaseService
    .from("orders")
    .select("id, order_number, financial_status, total_price, currency_code, email, phone")
    .eq("stripe_checkout_session_id", sessionId)
    .single();

  if (!order || order.financial_status !== "paid") {
    return NextResponse.json({ ok: false, error: "Order not found or not paid" }, { status: 404 });
  }

  const { data: items } = await supabaseService.from("order_items").select("variant_id, quantity").eq("order_id", order.id);
  const contents = (items ?? [])
    .filter((i) => i.variant_id)
    .map((i) => ({ id: i.variant_id as string, quantity: i.quantity }));

  const settings = await getMarketingSettings();
  if (!settings.metaPixelId || !settings.metaCapiAccessToken) {
    // Not configured yet -- safe no-op, never an error, never fabricated success.
    return NextResponse.json({ ok: true, skipped: true, reason: "Meta CAPI not configured" });
  }

  const userData: Record<string, string[]> = {};
  if (order.email) userData.em = [sha256(order.email)];
  if (order.phone) userData.ph = [sha256(order.phone.replace(/[^\d+]/g, ""))];

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: sessionId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: order.currency_code,
          value: Number(order.total_price),
          content_name: order.order_number,
          content_type: "product",
          content_ids: contents.map((c) => c.id),
          contents,
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(settings.metaCapiAccessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data?.error?.message ?? "Meta CAPI request failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Network error calling Meta CAPI" }, { status: 502 });
  }
}
