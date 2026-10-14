"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReview, deleteReview, type ReviewFormInput } from "@/app/admin/(authenticated)/reviews/[id]/actions";

export type ReviewFormInitial = {
  rating: number;
  authorName: string | null;
  body: string | null;
  verifiedBuyer: boolean;
  status: "pending" | "approved" | "rejected";
  source: "judgeme" | "manual" | "storefront";
  customerEmail: string | null;
  createdAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ReviewForm({ reviewId, initial }: { reviewId: string; initial: ReviewFormInitial }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial.rating);
  const [authorName, setAuthorName] = useState(initial.authorName ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [verifiedBuyer, setVerifiedBuyer] = useState(initial.verifiedBuyer);
  const [status, setStatus] = useState(initial.status);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    const input: ReviewFormInput = { rating, authorName: authorName || null, body: body || null, verifiedBuyer, status };
    startTransition(async () => {
      const result = await updateReview(reviewId, input);
      if (result.ok) {
        setMessage("Sparat.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteReview(reviewId, true);
      if (result.ok) router.push("/admin/reviews");
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>Recension</span>
          <span className="text-gray-400">
            {initial.source === "judgeme" ? "Importerad från Judge.me" : initial.source === "storefront" ? "Inskickad av kund" : "Manuellt tillagd"} ·{" "}
            {formatDate(initial.createdAt)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Betyg</label>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} stjärn{n === 1 ? "a" : "or"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              <option value="pending">Väntar</option>
              <option value="approved">Godkänd</option>
              <option value="rejected">Avvisad</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500">Författare</label>
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Anonym" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="text-xs text-gray-500">Text</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={verifiedBuyer} onChange={(e) => setVerifiedBuyer(e.target.checked)} />
          Verifierat köp
        </label>
        {initial.customerEmail && <p className="text-xs text-gray-400">Kund-e-post: {initial.customerEmail}</p>}
        {initial.source === "judgeme" && (
          <p className="text-xs text-gray-400">
            Importerad från Judge.me utan e-postadress — verifierat-köp-flaggan ovan är den ursprungligen importerade och kan inte
            räknas om automatiskt.
          </p>
        )}
      </div>

      {message && <div className="text-sm text-emerald-600">{message}</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <div className="flex items-center justify-between">
        <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Spara"}
        </button>
        {!showDelete ? (
          <button type="button" onClick={() => setShowDelete(true)} className="text-xs font-medium text-rose-700 underline hover:text-rose-900">
            Radera permanent…
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-rose-700">
              <input type="checkbox" checked={deleteConfirmed} onChange={(e) => setDeleteConfirmed(e.target.checked)} />
              Bekräfta permanent radering
            </label>
            <button type="button" onClick={confirmDelete} disabled={isPending || !deleteConfirmed} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Radera permanent
            </button>
            <button type="button" onClick={() => setShowDelete(false)} className="text-xs text-gray-500">
              Avbryt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
