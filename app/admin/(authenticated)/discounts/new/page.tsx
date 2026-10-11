import Link from "next/link";
import { NewDiscountForm } from "@/components/admin/new-discount-form";

export default function NewDiscountPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/discounts" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Rabatter
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny rabatt</h1>
      <NewDiscountForm />
    </div>
  );
}
