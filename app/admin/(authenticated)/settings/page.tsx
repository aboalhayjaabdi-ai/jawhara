import Link from "next/link";
import { getStoreSettings } from "@/lib/admin/store-settings";
import { StoreSettingsForm } from "@/components/admin/store-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Inställningar</h1>
        <div className="flex gap-4 text-xs">
          <Link href="/admin/settings/redirects" className="text-gray-500 underline hover:text-gray-900">
            Omdirigeringar
          </Link>
          <Link href="/admin/audit-log" className="text-gray-500 underline hover:text-gray-900">
            Aktivitetslogg
          </Link>
        </div>
      </div>
      <StoreSettingsForm
        initial={{
          businessName: settings.businessName,
          supportEmail: settings.supportEmail,
          supportPhone: settings.supportPhone,
          businessAddress: settings.businessAddress,
          vatRatePercent: settings.vatRatePercent,
        }}
        initialLogoUrl={settings.logoUrl}
      />
    </div>
  );
}
