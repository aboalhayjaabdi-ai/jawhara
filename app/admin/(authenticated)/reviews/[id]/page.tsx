import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { ReviewForm, type ReviewFormInitial } from "@/components/admin/review-form";
import { ReviewReplyCard } from "@/components/admin/review-reply-card";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();

  const { data: review } = await supabase
    .from("reviews")
    .select("*, products(id, title, handle)")
    .eq("id", id)
    .maybeSingle();
  if (!review) notFound();

  const photoUrls: string[] = Array.isArray(review.photo_urls) ? review.photo_urls : [];

  const initial: ReviewFormInitial = {
    rating: review.rating,
    authorName: review.author_name,
    body: review.body,
    verifiedBuyer: review.verified_buyer,
    status: review.status,
    source: review.source,
    customerEmail: review.customer_email,
    createdAt: review.created_at,
  };

  return (
    <div className="max-w-2xl">
      <Link href="/admin/reviews" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Recensioner
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">
        {(review as any).products?.title ?? "(okänd produkt)"}
      </h1>
      {(review as any).products?.handle && (
        <a
          href={`/products/${(review as any).products.handle}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gray-500 underline hover:text-gray-900"
        >
          Visa produkt på webbutiken ↗
        </a>
      )}

      <div className="mt-6 space-y-6">
        {photoUrls.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Bilder från kunden</div>
            <div className="flex flex-wrap gap-3">
              {photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" className="h-24 w-24 rounded-md border border-gray-200 object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        <ReviewForm reviewId={id} initial={initial} />
        <ReviewReplyCard reviewId={id} initialReply={review.merchant_reply_body} />
      </div>
    </div>
  );
}
