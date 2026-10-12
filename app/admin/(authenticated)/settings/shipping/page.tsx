import Link from "next/link";
import { getShippingSettings } from "@/lib/admin/shipping-settings";
import { ShippingSettingsForm } from "@/components/admin/shipping-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminShippingSettingsPage() {
  const settings = await getShippingSettings();

  return (
    <div className="max-w-xl">
      <Link href="/admin/settings" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Inställningar
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Frakt</h1>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Viktigt att veta:</strong> den här inställningen sparas verkligt i databasen, men är{" "}
        <strong>ännu inte kopplad till den riktiga kassan</strong>. Att ändra värden här påverkar{" "}
        <strong>inte</strong> vad en kund debiteras idag -- det kräver en separat, uttrycklig ändring av
        kassakoden (som av säkerhetsskäl aldrig ändras utan ditt direkta godkännande, eftersom den styr
        verkliga kortbetalningar). Säg till om du vill att jag kopplar in det här på riktigt.
      </div>

      <ShippingSettingsForm initialCountries={settings.allowedCountries} initialFlatRate={settings.flatRate} />
    </div>
  );
}
