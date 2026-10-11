import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireRole, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { assembleCustomerExport } from "@/lib/admin/gdpr";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return NextResponse.json({ error: roleCheck.error }, { status: 403 });

  const { id } = await params;
  const data = await assembleCustomerExport(id);
  if (!data) return NextResponse.json({ error: "Kunden hittades inte." }, { status: 404 });

  await supabaseService.from("customer_data_requests").insert({ customer_id: id, kind: "export", status: "completed", requested_by: admin.adminId });
  await logAdminAction(admin.adminId, "customers.export_data", "customer", id);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kund-${id}-personuppgifter-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
