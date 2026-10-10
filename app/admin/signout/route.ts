import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export async function POST(req: Request) {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", req.url));
}
