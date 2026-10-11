import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { csvEscape } from "@/lib/admin/csv/parse";
import { listCustomersWithStats } from "@/lib/admin/customer-stats";
import { parseCustomersListFilters, applyCustomersListFilters } from "@/lib/admin/customers-filters";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseCustomersListFilters(sp);

  const all = await listCustomersWithStats();
  const filtered = applyCustomersListFilters(all, filters);

  const ids = filtered.map((c) => c.id);
  const { data: addresses } = await supabaseService
    .from("addresses")
    .select("customer_id, company, address1, address2, city, province, zip, country, country_code, is_default")
    .in("customer_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  type AddressRow = NonNullable<typeof addresses>[number];
  const defaultAddressById = new Map<string, AddressRow>();
  for (const a of addresses ?? []) {
    if (!defaultAddressById.has(a.customer_id) || a.is_default) defaultAddressById.set(a.customer_id, a);
  }

  const header = [
    "Email",
    "First Name",
    "Last Name",
    "Phone",
    "Accepts Marketing",
    "Tags",
    "Note",
    "Source",
    "Order Count",
    "Total Spent",
    "Company",
    "Address1",
    "Address2",
    "City",
    "Province",
    "Zip",
    "Country",
    "Country Code",
  ];

  const rows = filtered.map((c) => {
    const addr = defaultAddressById.get(c.id);
    return [
      c.email ?? "",
      c.firstName ?? "",
      c.lastName ?? "",
      c.phone ?? "",
      c.acceptsMarketing,
      c.tags.join(", "),
      c.note ?? "",
      c.source,
      c.orderCount,
      c.totalSpent,
      addr?.company ?? "",
      addr?.address1 ?? "",
      addr?.address2 ?? "",
      addr?.city ?? "",
      addr?.province ?? "",
      addr?.zip ?? "",
      addr?.country ?? "",
      addr?.country_code ?? "",
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  await logAdminAction(admin.adminId, "customers.export_csv", undefined, undefined, { filters, customerCount: filtered.length });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jawhara-kunder-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
