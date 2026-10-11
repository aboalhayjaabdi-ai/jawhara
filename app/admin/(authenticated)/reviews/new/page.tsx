import Link from "next/link";
import { NewReviewForm } from "@/components/admin/new-review-form";

export default function NewReviewPage() {
  return (
    <div className="max-w-xl">
      <Link href="/admin/reviews" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Recensioner
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">Ny recension</h1>
      <NewReviewForm />
    </div>
  );
}
