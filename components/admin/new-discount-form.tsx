"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDiscount } from "@/app/admin/(authenticated)/discounts/new/actions";

export function NewDiscountForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"automatic" | "code">("automatic");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createDiscount({ title, kind, code });
      if (result.ok) router.push(`/admin/discounts/${result.discountId}`);
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
        <label className="text-xs text-gray-500">Typ</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as "automatic" | "code")} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
          <option value="automatic">Automatisk (gäller utan kod)</option>
          <option value="code">Rabattkod (kunden anger en kod)</option>
        </select>
      </div>
      {kind === "code" && (
        <div>
          <label className="text-xs text-gray-500">Kod</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="t.ex. SOMMAR20" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono" />
        </div>
      )}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Skapar…" : "Skapa rabatt"}
      </button>
      <p className="text-xs text-gray-400">Du väljer formen (procent på order eller köp X få Y), regler, kombinationer och schemaläggning på nästa sida.</p>
    </div>
  );
}
