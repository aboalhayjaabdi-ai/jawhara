"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCollection } from "@/app/admin/(authenticated)/collections/new/actions";

export function NewCollectionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Titel krävs.");
      return;
    }
    startTransition(async () => {
      const result = await createCollection({ title, handle: handle || undefined });
      if (result.ok) router.push(`/admin/collections/${result.collectionId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <label className="text-xs text-gray-500">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-500">URL-handle (valfritt, genereras annars automatiskt)</label>
        <input value={handle} onChange={(e) => setHandle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Skapar…" : "Skapa kollektion"}
      </button>
    </div>
  );
}
