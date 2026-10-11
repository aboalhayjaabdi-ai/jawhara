import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { mediaUrl } from "@/lib/supabase/media";

// Stores the full public URL directly into collections.image_url (confirmed already the stored
// format today, unlike media.storage_path) -- zero storefront read-path changes needed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id: collectionId } = await params;

  const { data: collection } = await supabaseService.from("collections").select("handle").eq("id", collectionId).maybeSingle();
  if (!collection) return NextResponse.json({ error: "Kollektionen hittades inte." }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil mottagen." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Endast bildfiler stöds." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `collections/${collectionId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseService.storage.from("product-media").upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const url = mediaUrl(storagePath);
  const { error: updateError } = await supabaseService.from("collections").update({ image_url: url }).eq("id", collectionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(admin.adminId, "collections.upload_image", "collection", collectionId, { storagePath });
  return NextResponse.json({ ok: true, url });
}
