import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/shipping-zones.ts must never be imported into client code");
}

export type ShippingRate = { id: string; name: string; price: number; minOrderValue: number | null };
export type ShippingZone = { id: string; name: string; countries: string[]; rates: ShippingRate[] };

export async function listShippingZonesWithRates(): Promise<ShippingZone[]> {
  const [{ data: zones }, { data: rates }] = await Promise.all([
    supabaseService.from("shipping_zones").select("id, name, countries").order("position"),
    supabaseService.from("shipping_rates").select("id, zone_id, name, price, min_order_value").order("position"),
  ]);

  return (zones ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    countries: z.countries ?? [],
    rates: (rates ?? [])
      .filter((r) => r.zone_id === z.id)
      .map((r) => ({ id: r.id, name: r.name, price: Number(r.price), minOrderValue: r.min_order_value == null ? null : Number(r.min_order_value) })),
  }));
}
