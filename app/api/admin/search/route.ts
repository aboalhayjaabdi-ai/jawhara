import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

export async function GET(request: Request) {
  await requireAdmin();

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [], orders: [], customers: [] });

  const supabase = await createAuthServerClient();
  const like = `%${q}%`;

  const [{ data: products }, { data: orders }, { data: customers }] = await Promise.all([
    supabase.from("products").select("id, title, handle, status").ilike("title", like).limit(5),
    supabase
      .from("orders")
      .select("id, order_number, email, total_price, currency_code")
      .or(`order_number.ilike.${like},email.ilike.${like}`)
      .limit(5),
    supabase.from("customers").select("id, first_name, last_name, email").or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`).limit(5),
  ]);

  return NextResponse.json({
    products: products ?? [],
    orders: orders ?? [],
    customers: customers ?? [],
  });
}
