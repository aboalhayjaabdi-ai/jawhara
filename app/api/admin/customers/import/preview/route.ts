import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseCustomersCsv, diffCustomersAgainstDatabase } from "@/lib/admin/csv/customers-import";

export async function POST(req: NextRequest) {
  await requireAdmin();

  const { csv } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ ok: false, error: "Ingen CSV-fil skickades." }, { status: 400 });
  }

  const { rows, errors: parseErrors } = parseCustomersCsv(csv);
  const preview = await diffCustomersAgainstDatabase(rows);

  return NextResponse.json({ ok: true, preview, parseErrors });
}
