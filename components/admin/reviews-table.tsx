"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkSetReviewStatus, bulkDeleteReviews } from "@/app/admin/(authenticated)/reviews/actions/bulk";

export type ReviewRow = {
  id: string;
  productId: string;
  productTitle: string;
  rating: number;
  authorName: string | null;
  body: string | null;
  verifiedBuyer: boolean;
  status: "pending" | "approved" | "rejected";
  source: "judgeme" | "manual" | "storefront";
  hasReply: boolean;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = { pending: "Väntar", approved: "Godkänd", rejected: "Avvisad" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

function stars(rating: number) {
  return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(rating);
}

type BulkAction = "approve" | "reject" | "pending" | "delete";

export function ReviewsTable({ reviews }: { reviews: ReviewRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | "">("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run() {
    setMessage(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      let result: { ok: boolean; count?: number; error?: string };
      switch (action) {
        case "approve":
          result = await bulkSetReviewStatus(ids, "approved");
          break;
        case "reject":
          result = await bulkSetReviewStatus(ids, "rejected");
          break;
        case "pending":
          result = await bulkSetReviewStatus(ids, "pending");
          break;
        case "delete":
          result = await bulkDeleteReviews(ids, confirmDelete);
          break;
        default:
          return;
      }
      if (result.ok) {
        setMessage(`Klart: ${result.count} recension(er) uppdaterade.`);
        setSelected(new Set());
        setAction("");
        setConfirmDelete(false);
      } else {
        setMessage(result.error ?? "Åtgärden misslyckades.");
      }
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-700">{selected.size} valda</span>
            <select value={action} onChange={(e) => setAction(e.target.value as BulkAction)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
              <option value="">Välj åtgärd…</option>
              <option value="approve">Godkänn</option>
              <option value="reject">Avvisa</option>
              <option value="pending">Sätt som väntande</option>
              <option value="delete">Radera</option>
            </select>
            {action === "delete" && (
              <label className="flex items-center gap-1 text-xs text-rose-700">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                Bekräfta permanent radering
              </label>
            )}
            {action && (
              <button type="button" onClick={run} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                {isPending ? "Bearbetar…" : "Verkställ"}
              </button>
            )}
          </div>
          {message && <div className="mt-2 text-xs text-gray-600">{message}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={reviews.length > 0 && selected.size === reviews.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(reviews.map((r) => r.id)) : new Set())}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-5 py-3">Produkt</th>
              <th className="px-5 py-3">Betyg</th>
              <th className="px-5 py-3">Recension</th>
              <th className="px-5 py-3">Kund</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Källa</th>
              <th className="px-5 py-3">Datum</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/reviews/${r.id}`} className="font-medium text-gray-900 hover:underline">
                    {r.productTitle}
                  </Link>
                  {r.hasReply && <div className="text-xs text-gray-400">Har svar</div>}
                </td>
                <td className="px-5 py-3 text-amber-500">{stars(r.rating)}</td>
                <td className="max-w-xs px-5 py-3 text-gray-500">
                  <span className="line-clamp-2">{r.body ?? "—"}</span>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {r.authorName ?? "Anonym"}
                  {r.verifiedBuyer && <div className="text-xs text-emerald-600">Verifierat köp</div>}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className="px-5 py-3 text-gray-500">{r.source === "judgeme" ? "Judge.me" : r.source === "storefront" ? "Webbutik" : "Manuell"}</td>
                <td className="px-5 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reviews.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga recensioner hittades.</p>}
      </div>
    </div>
  );
}
