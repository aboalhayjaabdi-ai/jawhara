import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { parseProductsCsv, commitImport } from "@/lib/admin/csv/products-import";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const { csv, handles } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ ok: false, error: "Ingen CSV-fil skickades." }, { status: 400 });
  }
  if (!Array.isArray(handles) || handles.length === 0) {
    return NextResponse.json({ ok: false, error: "Inga produkter markerade för import." }, { status: 400 });
  }

  const { groups } = parseProductsCsv(csv);
  const selected = new Set(handles as string[]);
  const toImport = groups.filter((g) => selected.has(g.handle));

  const results = await commitImport(toImport, admin.adminId);

  revalidatePath("/admin/products");
  for (const r of results) {
    if (r.ok) revalidatePath(`/admin/products/${r.productId}`);
  }

  return NextResponse.json({ ok: true, results });
}
