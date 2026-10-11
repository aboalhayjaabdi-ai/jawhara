import Link from "next/link";
import { NewProductForm } from "@/components/admin/new-product-form";

export default function NewProductPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/products" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Produkter
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny produkt</h1>
      <NewProductForm />
    </div>
  );
}
