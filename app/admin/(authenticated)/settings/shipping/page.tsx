import Link from "next/link";
import { listShippingZonesWithRates } from "@/lib/admin/shipping-zones";
import { ShippingZonesManager } from "@/components/admin/shipping-zones-manager";

export const dynamic = "force-dynamic";

export default async function AdminShippingSettingsPage() {
  const zones = await listShippingZonesWithRates();

  return (
    <div className="max-w-2xl">
      <Link href="/admin/settings" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Inställningar
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Frakt</h1>
        <Link href="/admin/settings/carriers" className="text-xs text-gray-500 underline hover:text-gray-900">
          Transportörer →
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Viktigt att veta:</strong> zoner och fraktalternativ sparas verkligt i databasen, men är{" "}
        <strong>ännu inte kopplade till den riktiga kassan</strong>. Att ändra värden här påverkar{" "}
        <strong>inte</strong> vad en kund debiteras idag -- det kräver en separat, uttrycklig ändring av
        kassakoden (som av säkerhetsskäl aldrig ändras utan ditt direkta godkännande, eftersom den styr
        verkliga kortbetalningar). Säg till om du vill att jag kopplar in det här på riktigt.
      </div>

      <ShippingZonesManager zones={zones} />
    </div>
  );
}
