import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { parseCustomersCsv, commitCustomersImport } from "@/lib/admin/csv/customers-import";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const { csv, rowNumbers } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ ok: false, error: "Ingen CSV-fil skickades." }, { status: 400 });
  }
  if (!Array.isArray(rowNumbers) || rowNumbers.length === 0) {
    return NextResponse.json({ ok: false, error: "Inga kunder markerade för import." }, { status: 400 });
  }

  const { rows } = parseCustomersCsv(csv);
  const selected = new Set(rowNumbers as number[]);
  const toImport = rows.filter((r) => selected.has(r.rowNumber));

  const results = await commitCustomersImport(toImport, admin.adminId);

  revalidatePath("/admin/customers");

  return NextResponse.json({ ok: true, results });
}
