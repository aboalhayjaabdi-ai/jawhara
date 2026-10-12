"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShippingCarrier, updateShippingCarrier, deleteShippingCarrier } from "@/app/admin/(authenticated)/settings/carriers/actions";
import type { ShippingCarrier } from "@/lib/admin/shipping-carriers";

function CarrierRow({ carrier }: { carrier: ShippingCarrier }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(carrier.name);
  const [template, setTemplate] = useState(carrier.trackingUrlTemplate ?? "");
  const [apiCode, setApiCode] = useState(carrier.trackingApiCarrierCode?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateShippingCarrier(carrier.id, name, template, apiCode.trim() ? Number(apiCode) : null);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!confirm(`Ta bort transportören "${carrier.name}"?`)) return;
    startTransition(async () => {
      await deleteShippingCarrier(carrier.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-gray-100 last:border-0">
        <td className="px-4 py-2" colSpan={4}>
          <div className="flex flex-wrap items-end gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
            <input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="https://.../track?id={trackingNumber}" className="min-w-[280px] flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm" />
            <input
              value={apiCode}
              onChange={(e) => setApiCode(e.target.value)}
              placeholder="17TRACK-kod"
              inputMode="numeric"
              className="w-28 rounded-md border border-gray-200 px-2 py-1 text-sm"
            />
            {error && <span className="text-xs text-rose-600">{error}</span>}
            <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50">
              Spara
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500">
              Avbryt
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-3 font-medium text-gray-900">{carrier.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-400">{carrier.trackingUrlTemplate ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-gray-500">{carrier.trackingApiCarrierCode ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-3 text-xs">
          <button type="button" onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-900">
            Redigera
          </button>
          <button type="button" onClick={remove} disabled={isPending} className="text-rose-600 hover:text-rose-700">
            Ta bort
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddCarrierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [apiCode, setApiCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createShippingCarrier(name, template, apiCode.trim() ? Number(apiCode) : null);
      if (result.ok) {
        setName("");
        setTemplate("");
        setApiCode("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ny transportör</div>
      <div className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, t.ex. Budbee" className="rounded-md border border-gray-200 px-3 py-2 text-sm" />
        <input
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="Spårnings-URL (valfritt), t.ex. https://.../track?id={trackingNumber}"
          className="min-w-[320px] flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={apiCode}
          onChange={(e) => setApiCode(e.target.value)}
          placeholder="17TRACK-kod (valfritt)"
          inputMode="numeric"
          className="w-36 rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        {error && <span className="text-xs text-rose-600">{error}</span>}
        <button type="button" onClick={add} disabled={isPending || !name.trim()} className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          Lägg till
        </button>
      </div>
    </div>
  );
}

export function ShippingCarriersManager({ carriers }: { carriers: ShippingCarrier[] }) {
  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Namn</th>
              <th className="px-4 py-3">Spårnings-URL</th>
              <th className="px-4 py-3">17TRACK-kod</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => (
              <CarrierRow key={c.id} carrier={c} />
            ))}
          </tbody>
        </table>
        {carriers.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga transportörer ännu.</p>}
      </div>
      <AddCarrierForm />
    </div>
  );
}
