import Link from "next/link";
import { NewCustomerForm } from "@/components/admin/new-customer-form";

export default function NewCustomerPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/customers" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Kunder
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny kund</h1>
      <NewCustomerForm />
    </div>
  );
}
