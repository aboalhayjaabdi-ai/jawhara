import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { parseReviewsListFilters, applyReviewsListFilters } from "@/lib/admin/reviews-filters";
import { getReviewStats } from "@/lib/admin/review-stats";
import { ReviewsFilterBar } from "@/components/admin/reviews-filter-bar";
import { ReviewsTable, type ReviewRow } from "@/components/admin/reviews-table";
import { ReviewRequestEmailsToggle } from "@/components/admin/review-request-emails-toggle";
import { getReviewRequestEmailsEnabled } from "@/app/admin/(authenticated)/reviews/actions/settings";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseReviewsListFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createAuthServerClient();
  let query = supabase
    .from("reviews")
    .select(
      "id, product_id, rating, author_name, body, verified_buyer, status, source, merchant_reply_body, created_at, products(title)",
      { count: "exact" }
    );
  query = applyReviewsListFilters(query as any, filters);
  const { data: reviews, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const stats = await getReviewStats();
  const requestEmailsEnabled = await getReviewRequestEmailsEnabled();

  const rows: ReviewRow[] = (reviews ?? []).map((r: any) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: r.products?.title ?? "(okänd produkt)",
    rating: r.rating,
    authorName: r.author_name,
    body: r.body,
    verifiedBuyer: r.verified_buyer,
    status: r.status,
    source: r.source,
    hasReply: Boolean(r.merchant_reply_body),
    createdAt: r.created_at,
  }));

  const total = count ?? 0;
  const hasNextPage = page * PAGE_SIZE < total;
  const exportParams = new URLSearchParams(Object.entries(sp).filter(([k]) => k !== "page").map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? "" : v ?? ""]));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Recensioner</h1>
        <Link href="/admin/reviews/new" className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          Ny recension
        </Link>
      </div>

      <div className="mb-6">
        <ReviewRequestEmailsToggle initialEnabled={requestEmailsEnabled} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Totalt" value={String(stats.total)} />
        <StatTile label="Snittbetyg" value={stats.avgRating != null ? stats.avgRating.toFixed(1) : "—"} />
        <StatTile label="Väntar" value={String(stats.pendingCount)} />
        <StatTile label="Godkända" value={String(stats.approvedCount)} />
        <StatTile label="Avvisade" value={String(stats.rejectedCount)} />
        <StatTile label="Verifierade köp" value={stats.verifiedPercent != null ? `${stats.verifiedPercent.toFixed(0)}%` : "—"} />
      </div>

      <div className="mb-3 text-xs uppercase tracking-wide text-gray-500">{total} recensioner totalt</div>

      <ReviewsFilterBar />
      <ReviewsTable reviews={rows} />

      {(page > 1 || hasNextPage) && (
        <div className="mt-6 flex justify-center gap-6 text-xs font-semibold uppercase tracking-wide">
          {page > 1 && (
            <Link href={`/admin/reviews?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Föregående
            </Link>
          )}
          {hasNextPage && (
            <Link href={`/admin/reviews?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) }).toString()}`} className="text-gray-500 hover:text-gray-900">
              Nästa
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
