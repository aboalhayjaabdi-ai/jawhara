"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHtmlPage } from "@/app/admin/(authenticated)/content/actions";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

export function HtmlPageForm({ id, handle, initialTitle, initialBodyHtml }: { id: string; handle: string; initialTitle: string; initialBodyHtml: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [bodyHtml, setBodyHtml] = useState(initialBodyHtml);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateHtmlPage(id, handle, title, bodyHtml);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-500">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Innehåll</label>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
      </div>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      {saved && <div className="text-sm text-emerald-600">Sparat.</div>}
      <button type="button" onClick={handleSave} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
