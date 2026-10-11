"use client";

import { useState, useTransition } from "react";
import { updateCustomerCore } from "@/app/admin/(authenticated)/customers/[id]/actions/core";

export function CustomerCoreForm({
  customerId,
  initial,
}: {
  customerId: string;
  initial: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null };
}) {
  const [firstName, setFirstName] = useState(initial.firstName ?? "");
  const [lastName, setLastName] = useState(initial.lastName ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateCustomerCore(customerId, { firstName, lastName, email, phone });
      if (result.ok) setMessage("Sparat.");
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kontaktuppgifter</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Förnamn</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Efternamn</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">E-post</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-gray-500">Telefon</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>
      {message && <div className="text-xs text-emerald-600">{message}</div>}
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
