import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

// Product handle search for the featured_product section's picker.
export async function GET(request: Request) {
  await requireAdmin();

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const supabase = await createAuthServerClient();
  const { data } = await supabase.from("products").select("handle, title").ilike("title", `%${q}%`).limit(10);
  return NextResponse.json({ products: data ?? [] });
}
