import { supabaseService } from "@/lib/supabase/service-client";
export { buildTrackingUrl } from "@/lib/shipping/tracking-url";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/shipping-carriers.ts must never be imported into client code");
}

export type ShippingCarrier = {
  id: string;
  name: string;
  trackingUrlTemplate: string | null;
  // Numeric carrier code from 17TRACK's own carrier list (lib/tracking/) -- null until a real
  // 17TRACK account exists and the real PostNord/DHL codes are looked up (never invented here).
  trackingApiCarrierCode: number | null;
};

export async function listShippingCarriers(): Promise<ShippingCarrier[]> {
  const { data } = await supabaseService
    .from("shipping_carriers")
    .select("id, name, tracking_url_template, tracking_api_carrier_code")
    .order("position");
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    trackingUrlTemplate: r.tracking_url_template,
    trackingApiCarrierCode: r.tracking_api_carrier_code,
  }));
}
