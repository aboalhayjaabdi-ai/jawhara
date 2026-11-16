import { revalidatePath } from "next/cache";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/reviews/revalidate.ts must never be imported into client code");
}

/** Product handles of these reviews -- read BEFORE a delete, while the rows still exist. */
export async function reviewProductHandles(reviewIds: string[]): Promise<string[]> {
  if (reviewIds.length === 0) return [];
  const { data } = await supabaseService.from("reviews").select("products(handle)").in("id", reviewIds);
  return [...new Set(((data ?? []) as any[]).map((r) => (Array.isArray(r.products) ? r.products[0] : r.products)?.handle).filter(Boolean))];
}

/** Makes a review change (removed, hidden, edited, replied to) show on the product page at once
 * instead of after the page's next scheduled refresh. */
export function revalidateProductPages(handles: string[]): void {
  for (const h of handles) revalidatePath(`/products/${h}`);
}
