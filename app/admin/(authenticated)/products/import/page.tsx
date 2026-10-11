import Link from "next/link";
import { CsvImportWizard } from "@/components/admin/csv-import-wizard";

export default function ProductsImportPage() {
  return (
    <div className="max-w-4xl">
      <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Produkter
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Importera produkter (CSV)</h1>
      <CsvImportWizard />
    </div>
  );
}
