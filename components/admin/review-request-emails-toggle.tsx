"use client";

import { useState, useTransition } from "react";
import { setReviewRequestEmailsEnabled } from "@/app/admin/(authenticated)/reviews/actions/settings";

export function ReviewRequestEmailsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setReviewRequestEmailsEnabled(next);
      if (!result.ok) setEnabled(!next);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Automatiska recensionsmejl</div>
        <div className="text-xs text-gray-400">14 dagar efter att en order markerats som skickad</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isPending}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-gray-300"} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <span className="text-xs font-semibold text-gray-700">{enabled ? "Aktiverat" : "Avstängt"}</span>
    </div>
  );
}
