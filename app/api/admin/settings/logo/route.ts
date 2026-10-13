import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { mediaUrl } from "@/lib/supabase/media";
import { uploadImageWithVariants } from "@/lib/supabase/upload-with-variants";

// Reuses the existing public product-media bucket under a new branding/ prefix -- same pattern
// as app/api/admin/storefront/upload-image/route.ts.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil mottagen." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Endast bildfiler stöds." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const storagePath = `branding/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await uploadImageWithVariants(storagePath, buffer, file.type);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 });

  await logAdminAction(admin.adminId, "settings.upload_logo", undefined, undefined, { storagePath });
  return NextResponse.json({ ok: true, url: mediaUrl(storagePath) });
}
