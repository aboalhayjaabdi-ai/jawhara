import Link from "next/link";
import { NewCollectionForm } from "@/components/admin/new-collection-form";

export default function NewCollectionPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/collections" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Kollektioner
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny kollektion</h1>
      <NewCollectionForm />
    </div>
  );
}
