import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { syncOrdersFromShopify } from "@/lib/shopify/sync-orders";

export async function POST() {
  const admin = await requireAdmin();
  try {
    const result = await syncOrdersFromShopify();
    await logAdminAction(admin.adminId, "orders.sync_from_shopify", undefined, undefined, result as unknown as Record<string, unknown>);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
