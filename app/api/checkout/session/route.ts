import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";

// Looks up order status by the opaque Stripe Checkout Session id -- the same id Stripe already
// puts in the return_url's query string, so this exposes nothing beyond what the browser URL bar
// already shows after a real checkout redirect.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

  const { data: order } = await supabaseService
    .from("orders")
    .select("order_number, financial_status, total_price")
    .eq("stripe_checkout_session_id", sessionId)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  return NextResponse.json({
    orderNumber: order.order_number,
    status: order.financial_status,
    total: Number(order.total_price),
  });
}
