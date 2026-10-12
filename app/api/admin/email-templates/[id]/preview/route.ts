import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getEmailTemplateById } from "@/lib/admin/email-templates";
import { renderSampleEmail } from "@/lib/email/sample-data";

// Admin-only preview of a template rendered with synthetic sample data -- never sends anything,
// never touches a real order. ?version=draft (default) shows unpublished edits; ?version=live
// shows exactly what real customers currently receive.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const version = request.nextUrl.searchParams.get("version") === "live" ? "live" : "draft";

  const template = await getEmailTemplateById(id);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { html } = renderSampleEmail(template.key, version === "live" ? template.live : template.draft);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
