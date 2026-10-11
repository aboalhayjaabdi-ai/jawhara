"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCollectionHandle } from "@/app/admin/(authenticated)/collections/[id]/actions/core";
import { deleteCollection } from "@/app/admin/(authenticated)/collections/[id]/actions/delete";
import { DiscountImpactWarning } from "@/components/admin/discount-impact-warning";
import type { DiscountImpact } from "@/lib/admin/discount-guard";

export function CollectionSidebarActions({
  collectionId,
  title,
  handle,
  source,
  productCount,
  discountImpact,
}: {
  collectionId: string;
  title: string;
  handle: string;
  source: "shopify" | "manual";
  productCount: number;
  discountImpact: DiscountImpact;
}) {
  const router = useRouter();
  const [handleValue, setHandleValue] = useState(handle);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [needsHandleConfirm, setNeedsHandleConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveHandle(confirmed = false) {
    setHandleError(null);
    startTransition(async () => {
      const result = await updateCollectionHandle(collectionId, handleValue, confirmed);
      if (result.ok) setNeedsHandleConfirm(false);
      else if (result.needsConfirmation) {
        setNeedsHandleConfirm(true);
        setHandleError(result.error);
      } else setHandleError(result.error);
    });
  }

  function confirmDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCollection(collectionId, deleteConfirmText === title);
      if (result.ok) router.push("/admin/collections");
      else setDeleteError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Källa</div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${source === "shopify" ? "bg-gray-100 text-gray-700" : "text-gray-400"}`}>
          {source === "shopify" ? "Shopify" : "Manuell"}
        </span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Handle</div>
        <div className="flex gap-2">
          <input value={handleValue} onChange={(e) => setHandleValue(e.target.value)} className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm" />
          <button type="button" onClick={() => saveHandle(false)} disabled={isPending} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Spara
          </button>
        </div>
        {handleError && <div className="mt-2 text-xs text-rose-600">{handleError}</div>}
        {needsHandleConfirm && (
          <button type="button" onClick={() => saveHandle(true)} className="mt-2 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700">
            Byt ändå
          </button>
        )}
      </div>

      {discountImpact.length > 0 && <DiscountImpactWarning impact={discountImpact} />}

      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">Radera kollektion</div>
        <p className="text-xs text-rose-700">
          {productCount} produkt(er) tappar kopplingen till kollektionen (produkterna raderas inte). Övervägning: produkterna finns kvar, bara listningen tas bort.
        </p>
        {!showDelete ? (
          <button type="button" onClick={() => setShowDelete(true)} className="mt-3 text-xs font-medium text-rose-700 underline hover:text-rose-900">
            Radera permanent…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="text-xs text-rose-700">
              Skriv <strong>{title}</strong> för att bekräfta
            </label>
            <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="w-full rounded-md border border-rose-300 px-3 py-2 text-sm" />
            {deleteError && <div className="text-xs text-rose-700">{deleteError}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending || deleteConfirmText !== title}
                className="rounded-md bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Radera permanent
              </button>
              <button type="button" onClick={() => setShowDelete(false)} className="text-xs text-gray-500 hover:text-gray-900">
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
