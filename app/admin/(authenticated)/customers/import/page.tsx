import Link from "next/link";
import { CustomersCsvImportWizard } from "@/components/admin/customers-csv-import-wizard";

export default function CustomersImportPage() {
  return (
    <div className="max-w-4xl">
      <Link href="/admin/customers" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Kunder
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Importera kunder (CSV)</h1>
      <CustomersCsvImportWizard />
    </div>
  );
}
