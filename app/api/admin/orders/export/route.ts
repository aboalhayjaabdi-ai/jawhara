import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { parseOrdersListFilters, applyOrdersListFilters } from "@/lib/admin/orders-filters";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseOrdersListFilters(sp);

  let query = supabaseService
    .from("orders")
    .select(
      "order_number, created_at, email, total_price, currency_code, financial_status, fulfillment_status, source, customers(first_name, last_name)"
    );
  query = applyOrdersListFilters(query as any, filters);
  const { data: orders } = await query;

  const header = ["Ordernummer", "Datum", "Kund", "E-post", "Betalstatus", "Leveransstatus", "Källa", "Summa", "Valuta"];
  const rows = (orders ?? []).map((o: any) => {
    const customerName = o.customers ? [o.customers.first_name, o.customers.last_name].filter(Boolean).join(" ") : "";
    return [o.order_number, o.created_at, customerName, o.email ?? "", o.financial_status ?? "", o.fulfillment_status ?? "", o.source, o.total_price, o.currency_code];
  });
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  await logAdminAction(admin.adminId, "orders.export_csv", undefined, undefined, { filters, rowCount: rows.length });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jawhara-ordrar-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
