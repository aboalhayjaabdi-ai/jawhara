import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { mediaUrl } from "@/lib/supabase/media";

// Upload is a Route Handler, not a Server Action -- this project's existing convention for
// anything resembling a file/binary operation (app/api/admin/orders/export,
// app/api/admin/products/search), and avoids Server Actions' smaller default multipart body cap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id: productId } = await params;

  const { data: product } = await supabaseService.from("products").select("handle").eq("id", productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produkten hittades inte." }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Ingen fil mottagen." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Endast bildfiler stöds." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `products/${productId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseService.storage.from("product-media").upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: maxRow } = await supabaseService.from("media").select("position").eq("product_id", productId).order("position", { ascending: false }).limit(1).maybeSingle();
  const position = (maxRow?.position ?? -1) + 1;

  const { data: mediaRow, error: insertError } = await supabaseService
    .from("media")
    .insert({ product_id: productId, storage_path: storagePath, position, alt_text: null })
    .select("id, storage_path, position")
    .single();
  if (insertError || !mediaRow) return NextResponse.json({ error: insertError?.message ?? "Kunde inte spara bilden." }, { status: 500 });

  await logAdminAction(admin.adminId, "products.upload_media", "product", productId, { mediaId: mediaRow.id });
  return NextResponse.json({ ok: true, mediaId: mediaRow.id, url: mediaUrl(mediaRow.storage_path), position: mediaRow.position });
}
