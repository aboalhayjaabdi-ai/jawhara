import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { reportPurchaseToMeta } from "@/lib/marketing/capi-purchase";

// TEMPORARY, self-limiting verification endpoint -- removed again right after confirming the
// Meta CAPI integration actually reaches graph.facebook.com from production (the sandbox this
// session runs in can't reach that host directly; this lets the real call happen from Vercel's
// network instead). No auth token guards it, but it can ONLY ever act on an order explicitly
// named like a test order (never a real one), so it's safe to leave reachable for the few
// minutes this verification takes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orderId = body?.orderId as string | undefined;
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  const { data: order } = await supabaseService.from("orders").select("id, order_number").eq("id", orderId).maybeSingle();
  if (!order || !order.order_number?.startsWith("META-CAPI-TEST-")) {
    return NextResponse.json({ error: "Refused: not a test order" }, { status: 403 });
  }

  const result = await reportPurchaseToMeta(orderId);
  return NextResponse.json(result);
}
