import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/store-settings.ts must never be imported into client code");
}

export type StoreSettings = {
  businessName: string;
  supportEmail: string;
  supportPhone: string;
  businessAddress: string;
  logoUrl: string | null;
  vatRatePercent: number;
};

const KEYS = ["business_name", "support_email", "support_phone", "business_address", "logo_url", "vat_rate_percent"] as const;

export async function getStoreSettings(): Promise<StoreSettings> {
  const { data } = await supabaseService.from("store_settings").select("key, value").in("key", KEYS);
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    businessName: (byKey.get("business_name") as string) ?? "",
    supportEmail: (byKey.get("support_email") as string) ?? "",
    supportPhone: (byKey.get("support_phone") as string) ?? "",
    businessAddress: (byKey.get("business_address") as string) ?? "",
    logoUrl: (byKey.get("logo_url") as string | null) ?? null,
    vatRatePercent: Number(byKey.get("vat_rate_percent") ?? 0),
  };
}
