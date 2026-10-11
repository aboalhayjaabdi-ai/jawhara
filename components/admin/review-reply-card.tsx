"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMerchantReply } from "@/app/admin/(authenticated)/reviews/[id]/actions";

export function ReviewReplyCard({ reviewId, initialReply }: { reviewId: string; initialReply: string | null }) {
  const router = useRouter();
  const [reply, setReply] = useState(initialReply ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await setMerchantReply(reviewId, reply || null);
      if (result.ok) {
        setMessage("Sparat. Svaret visas direkt på produktsidan.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function clear() {
    setReply("");
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await setMerchantReply(reviewId, null);
      if (result.ok) {
        setMessage("Svaret togs bort.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Svar från butiken</div>
      <p className="text-xs text-gray-400">Visas publikt under kundens recension på produktsidan, direkt efter att du sparar.</p>
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
        placeholder="Skriv ett svar till kunden…"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
      {message && <div className="text-sm text-emerald-600">{message}</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {isPending ? "Sparar…" : "Spara svar"}
        </button>
        {initialReply && (
          <button type="button" onClick={clear} disabled={isPending} className="text-xs font-medium text-rose-700 underline hover:text-rose-900">
            Ta bort svar
          </button>
        )}
      </div>
    </div>
  );
}
