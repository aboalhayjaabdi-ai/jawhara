import Link from "next/link";
import { getMarketingSettings } from "@/lib/admin/marketing-settings";
import { MarketingSettingsForm } from "@/components/admin/marketing-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminMarketingSettingsPage() {
  const settings = await getMarketingSettings();

  return (
    <div className="max-w-xl">
      <Link href="/admin/settings" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Inställningar
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Marknadsföring & analys</h1>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Så fungerar det:</strong> Pixel/GA4-skript och köphändelser (Purchase/purchase) är helt inaktiva tills du
        anger ett riktigt ID här, och laddas även då bara in på webbutiken efter att en besökare uttryckligen godkänt
        cookies i bannern längst ner på sidan -- aldrig innan. Ingen testdata eller påhittad statistik visas någonstans;
        riktiga siffror syns först i Meta Events Manager/Google Analytics när riktiga besökare genererar riktiga
        händelser.
      </div>

      <MarketingSettingsForm initialPixelId={settings.metaPixelId ?? ""} initialGa4Id={settings.ga4MeasurementId ?? ""} hasCapiToken={!!settings.metaCapiAccessToken} />

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Produktflöde</div>
        <p>
          Ett publikt Google Shopping/Meta-kompatibelt produktflöde med alla aktiva produkter finns alltid tillgängligt,
          oavsett ovanstående inställningar, på{" "}
          <a href="/feed/products.xml" target="_blank" rel="noreferrer" className="underline">
            /feed/products.xml
          </a>
          . Lägg till den adressen i Google Merchant Center eller Meta Commerce Manager för att importera katalogen.
        </p>
      </div>
    </div>
  );
}
