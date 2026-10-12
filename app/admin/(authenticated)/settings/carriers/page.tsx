import Link from "next/link";
import { listShippingCarriers } from "@/lib/admin/shipping-carriers";
import { ShippingCarriersManager } from "@/components/admin/shipping-carriers-manager";

export const dynamic = "force-dynamic";

export default async function AdminCarriersSettingsPage() {
  const carriers = await listShippingCarriers();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/settings/shipping" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Frakt
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">Transportörer</h1>
      <p className="mb-6 text-xs text-gray-500">
        Sparade transportörer med spårnings-URL-mall (använd <code>{"{trackingNumber}"}</code> där spårningsnumret ska sättas
        in). Används som val i leveransformuläret på ordrar, så att en spårningslänk fylls i automatiskt.
      </p>
      <ShippingCarriersManager carriers={carriers} />
    </div>
  );
}
