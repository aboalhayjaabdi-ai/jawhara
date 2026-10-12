"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
  createShippingRate,
  updateShippingRate,
  deleteShippingRate,
} from "@/app/admin/(authenticated)/settings/shipping/actions";
import type { ShippingZone } from "@/lib/admin/shipping-zones";

function formatSek(amount: number) {
  return `${amount.toLocaleString("sv-SE")} kr`;
}

function RateRow({ rate }: { rate: ShippingZone["rates"][number] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rate.name);
  const [price, setPrice] = useState(rate.price);
  const [minOrderValue, setMinOrderValue] = useState<string>(rate.minOrderValue != null ? String(rate.minOrderValue) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateShippingRate(rate.id, name, price, minOrderValue.trim() === "" ? null : Number(minOrderValue));
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!confirm(`Ta bort fraktalternativet "${rate.name}"?`)) return;
    startTransition(async () => {
      await deleteShippingRate(rate.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" placeholder="Namn" />
        <input type="number" min={0} step="1" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
        <input
          type="number"
          min={0}
          step="1"
          value={minOrderValue}
          onChange={(e) => setMinOrderValue(e.target.value)}
          placeholder="Min. ordervärde"
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
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm">
      <div>
        <span className="font-medium text-gray-900">{rate.name}</span>{" "}
        <span className="text-gray-500">— {rate.price === 0 ? "Fri frakt" : formatSek(rate.price)}</span>
        {rate.minOrderValue != null && <span className="ml-1 text-xs text-gray-400">(vid order ≥ {formatSek(rate.minOrderValue)})</span>}
      </div>
      <div className="flex gap-3 text-xs">
        <button type="button" onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-900">
          Redigera
        </button>
        <button type="button" onClick={remove} disabled={isPending} className="text-rose-600 hover:text-rose-700">
          Ta bort
        </button>
      </div>
    </div>
  );
}

function AddRateForm({ zoneId }: { zoneId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [minOrderValue, setMinOrderValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createShippingRate(zoneId, name, price, minOrderValue.trim() === "" ? null : Number(minOrderValue));
      if (result.ok) {
        setName("");
        setPrice(0);
        setMinOrderValue("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, t.ex. Standardfrakt" className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
      <input type="number" min={0} step="1" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
      <input
        type="number"
        min={0}
        step="1"
        value={minOrderValue}
        onChange={(e) => setMinOrderValue(e.target.value)}
        placeholder="Min. ordervärde (valfritt)"
        className="w-36 rounded-md border border-gray-200 px-2 py-1 text-sm"
      />
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button type="button" onClick={add} disabled={isPending || !name.trim()} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        + Lägg till fraktalternativ
      </button>
    </div>
  );
}

function ZoneCard({ zone }: { zone: ShippingZone }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(zone.name);
  const [countriesText, setCountriesText] = useState(zone.countries.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    const countries = countriesText.split(",").map((c) => c.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await updateShippingZone(zone.id, name, countries);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!confirm(`Ta bort zonen "${zone.name}" och alla dess fraktalternativ?`)) return;
    startTransition(async () => {
      await deleteShippingZone(zone.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
            <input value={countriesText} onChange={(e) => setCountriesText(e.target.value)} placeholder="SE, DK, NO" className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
            {error && <span className="text-xs text-rose-600">{error}</span>}
            <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50">
              Spara
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500">
              Avbryt
            </button>
          </div>
        ) : (
          <div>
            <div className="font-medium text-gray-900">{zone.name}</div>
            <div className="text-xs text-gray-400">{zone.countries.join(", ")}</div>
          </div>
        )}
        {!editing && (
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={() => setEditing(true)} className="text-gray-500 hover:text-gray-900">
              Redigera zon
            </button>
            <button type="button" onClick={remove} disabled={isPending} className="text-rose-600 hover:text-rose-700">
              Ta bort zon
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {zone.rates.map((r) => (
          <RateRow key={r.id} rate={r} />
        ))}
        {zone.rates.length === 0 && <p className="text-xs text-gray-400">Inga fraktalternativ i den här zonen ännu.</p>}
      </div>
      <AddRateForm zoneId={zone.id} />
    </div>
  );
}

function AddZoneForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [countriesText, setCountriesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    const countries = countriesText.split(",").map((c) => c.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await createShippingZone(name, countries);
      if (result.ok) {
        setName("");
        setCountriesText("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ny zon</div>
      <div className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, t.ex. Norden" className="rounded-md border border-gray-200 px-3 py-2 text-sm" />
        <input value={countriesText} onChange={(e) => setCountriesText(e.target.value)} placeholder="Länder, t.ex. DK, NO, FI" className="rounded-md border border-gray-200 px-3 py-2 text-sm" />
        {error && <span className="text-xs text-rose-600">{error}</span>}
        <button type="button" onClick={add} disabled={isPending || !name.trim()} className="rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          Lägg till zon
        </button>
      </div>
    </div>
  );
}

// Deliberately holds no local copy of `zones` -- every CRUD sub-component calls router.refresh()
// after a successful Server Action, which re-renders the Server Component parent and passes this
// component a fresh `zones` prop. Reading the prop directly (instead of seeding useState from it
// once) is what makes that actually show up -- a lesson already learned once in this project
// (components/admin/redirects-list.tsx's fix, Phase 1 of the admin-completion roadmap).
export function ShippingZonesManager({ zones }: { zones: ShippingZone[] }) {
  return (
    <div className="space-y-4">
      {zones.map((zone) => (
        <ZoneCard key={zone.id} zone={zone} />
      ))}
      <AddZoneForm />
    </div>
  );
}
