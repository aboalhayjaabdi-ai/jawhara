import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/shipping-settings.ts must never be imported into client code");
}

export type ShippingSettings = {
  allowedCountries: string[];
  flatRate: number;
};

export async function getShippingSettings(): Promise<ShippingSettings> {
  const { data } = await supabaseService.from("store_settings").select("key, value").in("key", ["shipping_allowed_countries", "shipping_flat_rate"]);
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    allowedCountries: (byKey.get("shipping_allowed_countries") as string[]) ?? ["SE"],
    flatRate: Number(byKey.get("shipping_flat_rate") ?? 0),
  };
}
