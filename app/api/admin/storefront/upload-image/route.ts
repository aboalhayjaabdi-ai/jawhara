import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { mediaUrl } from "@/lib/supabase/media";
import { uploadImageWithVariants } from "@/lib/supabase/upload-with-variants";

// Reuses the existing public `product-media` Storage bucket (same one products/collections
// already upload into) under a new `storefront/` path prefix -- no new bucket needed. Route
// Handler, not a Server Action, matching this project's existing file-upload convention
// (app/api/admin/products/[id]/media, .../collections/[id]/image).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil mottagen." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Endast bildfiler stöds." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `storefront/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await uploadImageWithVariants(storagePath, buffer, file.type);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 });

  await logAdminAction(admin.adminId, "storefront.upload_image", undefined, undefined, { storagePath });
  return NextResponse.json({ ok: true, url: mediaUrl(storagePath) });
}
