"use client";

import { useState, useTransition } from "react";
import { updateOrderNote, updateOrderTags } from "@/app/admin/(authenticated)/orders/[id]/actions/notes";

export function OrderNotesCard({ orderId, initialNote, initialTags }: { orderId: string; initialNote: string | null; initialTags: string[] }) {
  const [note, setNote] = useState(initialNote ?? "");
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveNote() {
    startTransition(async () => {
      const result = await updateOrderNote(orderId, note);
      if (result.ok) {
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  }

  function saveTags() {
    startTransition(async () => {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const result = await updateOrderTags(orderId, tags);
      if (result.ok) {
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Anteckning</div>
        {status === "saved" && <span className="text-xs text-emerald-600">Sparat</span>}
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setStatus("idle");
        }}
        onBlur={saveNote}
        rows={3}
        placeholder="Intern anteckning, syns inte för kunden…"
        className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
      />

      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Taggar</div>
      <input
        value={tagsInput}
        onChange={(e) => {
          setTagsInput(e.target.value);
          setStatus("idle");
        }}
        onBlur={saveTags}
        placeholder="komma, separerade, taggar"
        className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
      />
      {isPending && <div className="mt-2 text-xs text-gray-400">Sparar…</div>}
      {status === "error" && error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
