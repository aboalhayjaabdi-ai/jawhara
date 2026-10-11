import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseProductsCsv, diffAgainstDatabase } from "@/lib/admin/csv/products-import";

export async function POST(req: NextRequest) {
  await requireAdmin();

  const { csv } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ ok: false, error: "Ingen CSV-fil skickades." }, { status: 400 });
  }

  const { groups, errors: parseErrors } = parseProductsCsv(csv);
  const preview = await diffAgainstDatabase(groups);

  return NextResponse.json({ ok: true, preview, parseErrors });
}
