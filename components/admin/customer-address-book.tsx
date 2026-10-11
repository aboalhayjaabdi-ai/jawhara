"use client";

import { useState, useTransition } from "react";
import { addAddress, updateAddress, deleteAddress, setDefaultAddress, type AddressInput } from "@/app/admin/(authenticated)/customers/[id]/actions/addresses";

export type Address = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
  isDefault: boolean;
};

function emptyAddress(): AddressInput {
  return {
    firstName: null,
    lastName: null,
    company: null,
    address1: null,
    address2: null,
    city: null,
    province: null,
    provinceCode: null,
    zip: null,
    country: null,
    countryCode: null,
    phone: null,
    isDefault: false,
  };
}

function AddressForm({ initial, onSave, onCancel, isPending }: { initial: AddressInput; onSave: (input: AddressInput) => void; onCancel: () => void; isPending: boolean }) {
  const [form, setForm] = useState<AddressInput>(initial);
  const set = (patch: Partial<AddressInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={form.firstName ?? ""} onChange={(e) => set({ firstName: e.target.value || null })} placeholder="Förnamn" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        <input value={form.lastName ?? ""} onChange={(e) => set({ lastName: e.target.value || null })} placeholder="Efternamn" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      </div>
      <input value={form.company ?? ""} onChange={(e) => set({ company: e.target.value || null })} placeholder="Företag" className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      <input value={form.address1 ?? ""} onChange={(e) => set({ address1: e.target.value || null })} placeholder="Adress" className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      <input value={form.address2 ?? ""} onChange={(e) => set({ address2: e.target.value || null })} placeholder="Adress 2" className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      <div className="grid grid-cols-3 gap-2">
        <input value={form.zip ?? ""} onChange={(e) => set({ zip: e.target.value || null })} placeholder="Postnr" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        <input value={form.city ?? ""} onChange={(e) => set({ city: e.target.value || null })} placeholder="Stad" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        <input value={form.province ?? ""} onChange={(e) => set({ province: e.target.value || null })} placeholder="Län" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.country ?? ""} onChange={(e) => set({ country: e.target.value || null })} placeholder="Land" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
        <input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value || null })} placeholder="Telefon" className="rounded-md border border-gray-200 px-2 py-1.5 text-sm" />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
        Standardadress
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(form)} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          Spara
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-900">
          Avbryt
        </button>
      </div>
    </div>
  );
}

export function CustomerAddressBook({ customerId, initialAddresses }: { customerId: string; initialAddresses: Address[] }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(input: AddressInput, addressId?: string) {
    setError(null);
    startTransition(async () => {
      const result = addressId ? await updateAddress(customerId, addressId, input) : await addAddress(customerId, input);
      if (result.ok) {
        setEditingId(null);
        setAdding(false);
        // Re-fetch isn't wired here (no client Supabase call in this admin surface) -- the
        // revalidatePath in the action refreshes the server data on next navigation; reflect the
        // edit optimistically in the meantime.
        if (addressId) {
          setAddresses((prev) =>
            prev.map((a) => (a.id === addressId ? { ...input, id: addressId } : input.isDefault ? { ...a, isDefault: false } : a))
          );
        } else {
          setAddresses((prev) => [...prev.map((a) => (input.isDefault ? { ...a, isDefault: false } : a)), { ...input, id: crypto.randomUUID() }]);
        }
      } else {
        setError(result.error);
      }
    });
  }

  function remove(addressId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteAddress(customerId, addressId);
      if (result.ok) setAddresses((prev) => prev.filter((a) => a.id !== addressId));
      else setError(result.error);
    });
  }

  function makeDefault(addressId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultAddress(customerId, addressId);
      if (result.ok) setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === addressId })));
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Adresser</div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
            + Lägg till adress
          </button>
        )}
      </div>

      {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}

      <div className="space-y-3">
        {addresses.map((a) =>
          editingId === a.id ? (
            <AddressForm key={a.id} initial={a} onSave={(input) => save(input, a.id)} onCancel={() => setEditingId(null)} isPending={isPending} />
          ) : (
            <div key={a.id} className="rounded-md border border-gray-200 p-3 text-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}
                    {a.isDefault && <span className="ml-2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">Standard</span>}
                  </div>
                  {a.company && <div className="text-gray-500">{a.company}</div>}
                  <div className="text-gray-500">{a.address1}</div>
                  {a.address2 && <div className="text-gray-500">{a.address2}</div>}
                  <div className="text-gray-500">
                    {a.zip} {a.city}
                  </div>
                  <div className="text-gray-500">
                    {a.province} {a.country}
                  </div>
                  {a.phone && <div className="text-gray-500">{a.phone}</div>}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  <button type="button" onClick={() => setEditingId(a.id)} className="text-gray-500 underline hover:text-gray-900">
                    Redigera
                  </button>
                  {!a.isDefault && (
                    <button type="button" onClick={() => makeDefault(a.id)} className="text-gray-500 underline hover:text-gray-900">
                      Gör till standard
                    </button>
                  )}
                  <button type="button" onClick={() => remove(a.id)} className="text-rose-600 underline hover:text-rose-700">
                    Ta bort
                  </button>
                </div>
              </div>
            </div>
          )
        )}
        {adding && <AddressForm initial={emptyAddress()} onSave={(input) => save(input)} onCancel={() => setAdding(false)} isPending={isPending} />}
        {addresses.length === 0 && !adding && <p className="text-sm text-gray-400">Inga adresser.</p>}
      </div>
    </div>
  );
}
