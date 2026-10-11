"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomer } from "@/app/admin/(authenticated)/customers/new/actions";

export function NewCustomerForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomer({ firstName, lastName, email, phone, acceptsMarketing });
      if (result.ok) router.push(`/admin/customers/${result.customerId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
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
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={acceptsMarketing} onChange={(e) => setAcceptsMarketing(e.target.checked)} />
        Godkänner marknadsföring
      </label>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Skapar…" : "Skapa kund"}
      </button>
    </div>
  );
}
