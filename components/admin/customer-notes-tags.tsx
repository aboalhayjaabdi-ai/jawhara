"use client";

import { useState, useTransition } from "react";
import { updateCustomerNote, updateCustomerTags } from "@/app/admin/(authenticated)/customers/[id]/actions/core";

export function CustomerNotesTags({ customerId, initialNote, initialTags }: { customerId: string; initialNote: string | null; initialTags: string[] }) {
  const [note, setNote] = useState(initialNote ?? "");
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveNote() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateCustomerNote(customerId, note);
      if (result.ok) setMessage("Anteckning sparad.");
      else setError(result.error);
    });
  }

  function saveTags() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateCustomerTags(customerId, tagsInput.split(",").map((t) => t.trim()).filter(Boolean));
      if (result.ok) setMessage("Taggar sparade.");
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Anteckning</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} rows={3} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Taggar</div>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={saveTags}
          placeholder="komma, separerade, taggar"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      </div>
      {message && <div className="text-xs text-emerald-600">{message}</div>}
      {error && <div className="text-xs text-rose-600">{error}</div>}
      {isPending && <div className="text-xs text-gray-400">Sparar…</div>}
    </div>
  );
}
