"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateContactPage } from "@/app/admin/(authenticated)/content/actions";

export function ContactPageForm({
  id,
  handle,
  initialTitle,
  initialIntro,
  initialEmailNote,
}: {
  id: string;
  handle: string;
  initialTitle: string;
  initialIntro: string;
  initialEmailNote: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [intro, setIntro] = useState(initialIntro);
  const [emailNote, setEmailNote] = useState(initialEmailNote);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateContactPage(id, handle, title, intro, emailNote);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <label className="text-xs text-gray-500">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-500">Introtext (ovanför formuläret)</label>
        <input value={intro} onChange={(e) => setIntro(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-500">E-postnotis (under formuläret)</label>
        <input value={emailNote} onChange={(e) => setEmailNote(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <p className="text-xs text-gray-400">Själva kontaktformuläret (fält och funktion) redigeras inte här -- bara texten runt det.</p>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      {saved && <div className="text-sm text-emerald-600">Sparat.</div>}
      <button type="button" onClick={handleSave} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
