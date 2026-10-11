import Link from "next/link";
import { ManualOrderForm } from "@/components/admin/manual-order-form";

export default function NewOrderPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/admin/orders" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Ordrar
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny order</h1>
      <ManualOrderForm />
    </div>
  );
}
