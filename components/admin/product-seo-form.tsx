"use client";

import { useState, useTransition } from "react";
import { updateProductSeo } from "@/app/admin/(authenticated)/products/[id]/actions/core";

export function ProductSeoForm({ productId, initial }: { productId: string; initial: { seoTitle: string | null; seoDescription: string | null } }) {
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription ?? "");
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProductSeo(productId, { seoTitle: seoTitle || null, seoDescription: seoDescription || null });
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sökmotoroptimering</div>
        {status === "saved" && <span className="text-xs text-emerald-600">Sparat</span>}
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500">SEO-titel</label>
          <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">SEO-beskrivning</label>
          <textarea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
