"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreVersionAction } from "@/app/admin/(authenticated)/storefront/history/actions";

export function RestoreVersionButton({ version }: { version: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function restore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreVersionAction(version);
      if (result.ok) router.push("/admin/storefront");
      else setError(result.error);
    });
  }

  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
        Återställ till utkast…
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={restore} disabled={isPending} className="text-xs font-medium text-rose-700 underline">
        {isPending ? "Återställer…" : "Bekräfta"}
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="text-xs text-gray-400">
        Avbryt
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
