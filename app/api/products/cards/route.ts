import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getProductCardsByIds } from "@/lib/queries";

// Read-only: current product cards (price, compare-at price, stock) for a few product handles, in
// the order given. Used to refresh the visitor's own "Nyligen visade" list, which is saved in
// their browser and would otherwise keep showing the price from when they viewed the product.
const MAX_HANDLES = 12;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const handles: string[] = Array.isArray(body?.handles)
    ? body.handles.filter((h: unknown): h is string => typeof h === "string" && h.length < 200).slice(0, MAX_HANDLES)
    : [];
  if (handles.length === 0) return NextResponse.json({ products: [] });
  try {
    const { data } = await supabase.from("products").select("id, handle").in("handle", handles).eq("status", "active");
    const idByHandle = new Map((data ?? []).map((p) => [p.handle as string, p.id as string]));
    const ids = handles.flatMap((h) => (idByHandle.has(h) ? [idByHandle.get(h)!] : []));
    return NextResponse.json({ products: await getProductCardsByIds(ids) });
  } catch {
    return NextResponse.json({ products: null });
  }
}
