import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/marketing-settings.ts must never be imported into client code");
}

export type MarketingSettings = {
  id: string;
  metaPixelId: string | null;
  metaCapiAccessToken: string | null;
  ga4MeasurementId: string | null;
};

/** Full admin read, including the real CAPI secret -- only ever used inside admin pages/Server
 * Actions and the server-side CAPI route, never passed to client code. */
export async function getMarketingSettings(): Promise<MarketingSettings> {
  const { data } = await supabaseService.from("marketing_settings").select("id, meta_pixel_id, meta_capi_access_token, ga4_measurement_id").limit(1).single();
  if (!data) return { id: "", metaPixelId: null, metaCapiAccessToken: null, ga4MeasurementId: null };
  return { id: data.id, metaPixelId: data.meta_pixel_id, metaCapiAccessToken: data.meta_capi_access_token, ga4MeasurementId: data.ga4_measurement_id };
}

/** Hand-picks ONLY the two non-secret IDs -- these are safe to pass into client code (a Pixel ID
 * and a GA4 Measurement ID are not secrets; every site that uses them ships them in page source
 * by design). The real CAPI access token column is never selected by this function at all. */
export async function getPublicMarketingIds(): Promise<{ metaPixelId: string | null; ga4MeasurementId: string | null }> {
  const { data } = await supabaseService.from("marketing_settings").select("meta_pixel_id, ga4_measurement_id").limit(1).single();
  return { metaPixelId: data?.meta_pixel_id ?? null, ga4MeasurementId: data?.ga4_measurement_id ?? null };
}
