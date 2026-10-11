import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

// All real collections (~31 rows -- small enough to return in full, no search needed) for the
// section editor's collection pickers (product_list.collectionHandle, collection_links.handles).
export async function GET() {
  await requireAdmin();
  const supabase = await createAuthServerClient();
  const { data } = await supabase.from("collections").select("handle, title").order("title");
  return NextResponse.json({ collections: data ?? [] });
}
