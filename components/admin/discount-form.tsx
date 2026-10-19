"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDiscount, deleteDiscount, syncDiscountNow, type DiscountFormInput } from "@/app/admin/(authenticated)/discounts/[id]/actions";
import { DiscountItemPicker, type PickerItem } from "@/components/admin/discount-item-picker";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export type DiscountFormInitial = {
  title: string;
  kind: "automatic" | "code";
  code: string | null;
  status: "draft" | "scheduled" | "active" | "expired";
  getPercentage: number | null;
  buyQuantity: number | null;
  buyItemType: "all" | "product" | "collection" | null;
  buyItems: PickerItem[];
  getQuantity: number | null;
  getItemType: "all" | "product" | "collection" | null;
  getItems: PickerItem[];
  combinesWithOrder: boolean;
  combinesWithProduct: boolean;
  combinesWithShipping: boolean;
  usesPerOrderLimit: number | null;
  usageLimit: number | null;
  appliesOncePerCustomer: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export function DiscountForm({ discountId, initial, allCollections }: { discountId: string; initial: DiscountFormInitial; allCollections: PickerItem[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState(initial.kind);
  const [code, setCode] = useState(initial.code ?? "");
  const [status, setStatus] = useState(initial.status);
  const [shape, setShape] = useState<"order_percentage" | "bxgy">(initial.buyQuantity != null ? "bxgy" : "order_percentage");
  const [getPercentage, setGetPercentage] = useState(initial.getPercentage ?? 100);
  const [buyQuantity, setBuyQuantity] = useState(initial.buyQuantity ?? 2);
  const [buyItemType, setBuyItemType] = useState<"all" | "product" | "collection">(initial.buyItemType ?? "collection");
  const [buyItems, setBuyItems] = useState<PickerItem[]>(initial.buyItems);
  const [getQuantity, setGetQuantity] = useState(initial.getQuantity ?? 1);
  const [getItemType, setGetItemType] = useState<"all" | "product" | "collection">(initial.getItemType ?? "collection");
  const [getItems, setGetItems] = useState<PickerItem[]>(initial.getItems);
  const [combinesWithOrder, setCombinesWithOrder] = useState(initial.combinesWithOrder);
  const [combinesWithProduct, setCombinesWithProduct] = useState(initial.combinesWithProduct);
  const [combinesWithShipping, setCombinesWithShipping] = useState(initial.combinesWithShipping);
  const [usesPerOrderLimit, setUsesPerOrderLimit] = useState(initial.usesPerOrderLimit?.toString() ?? "");
  const [usageLimit, setUsageLimit] = useState(initial.usageLimit?.toString() ?? "");
  const [appliesOncePerCustomer, setAppliesOncePerCustomer] = useState(initial.appliesOncePerCustomer);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial.endsAt));

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);
    const input: DiscountFormInput = {
      title,
      kind,
      code: kind === "code" ? code : null,
      status,
      shape,
      getPercentage,
      buyQuantity: shape === "bxgy" ? buyQuantity : null,
      buyItemType: shape === "bxgy" ? buyItemType : null,
      buyItemIds: shape === "bxgy" && buyItemType !== "all" ? buyItems.map((i) => i.shopifyId) : null,
      getQuantity: shape === "bxgy" ? getQuantity : null,
      getItemType: shape === "bxgy" ? getItemType : null,
      getItemIds: shape === "bxgy" && getItemType !== "all" ? getItems.map((i) => i.shopifyId) : null,
      combinesWithOrder,
      combinesWithProduct,
      combinesWithShipping,
      usesPerOrderLimit: usesPerOrderLimit ? Number(usesPerOrderLimit) : null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      appliesOncePerCustomer,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
    };
    startTransition(async () => {
      const result = await updateDiscount(discountId, input);
      if (result.ok) {
        setMessage(result.shopifyWarning ? `Sparat. ${result.shopifyWarning}` : "Sparat.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteDiscount(discountId, true);
      if (result.ok) router.push("/admin/discounts");
      else setError(result.error);
    });
  }

  function syncNow() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await syncDiscountNow(discountId);
      if (result.ok) {
        setMessage(result.shopifyWarning ?? "Synkad till Shopify.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Grundinformation</div>
        <div>
          <label className="text-xs text-gray-500">Titel</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Typ</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as "automatic" | "code")} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              <option value="automatic">Automatisk</option>
              <option value="code">Kod</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              <option value="draft">Utkast</option>
              <option value="scheduled">Schemalagd</option>
              <option value="active">Aktiv</option>
              <option value="expired">Utgången</option>
            </select>
          </div>
        </div>
        {kind === "code" && (
          <div>
            <label className="text-xs text-gray-500">Kod</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono" />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rabattform</div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={shape === "order_percentage"} onChange={() => setShape("order_percentage")} />
            Procent på hela ordern
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={shape === "bxgy"} onChange={() => setShape("bxgy")} />
            Köp X få Y
          </label>
        </div>

        {shape === "order_percentage" && (
          <div>
            <label className="text-xs text-gray-500">Procent av ordersumman</label>
            <input type="number" min={1} max={100} value={getPercentage} onChange={(e) => setGetPercentage(Number(e.target.value))} className="mt-1 w-24 rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        )}

        {shape === "bxgy" && (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">Köp-villkor</div>
              <div className="mb-2 flex items-center gap-3">
                <label className="text-xs text-gray-500">Antal att köpa</label>
                <input type="number" min={1} value={buyQuantity} onChange={(e) => setBuyQuantity(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
                <select value={buyItemType} onChange={(e) => setBuyItemType(e.target.value as typeof buyItemType)} className="rounded-md border border-gray-200 px-2 py-1 text-sm">
                  <option value="all">Alla produkter</option>
                  <option value="product">Specifika produkter</option>
                  <option value="collection">Specifika kollektioner</option>
                </select>
              </div>
              <DiscountItemPicker itemType={buyItemType} selected={buyItems} onChange={setBuyItems} allCollections={allCollections} />
            </div>

            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">Få-villkor</div>
              <div className="mb-2 flex items-center gap-3">
                <label className="text-xs text-gray-500">Antal gratis/rabatterade</label>
                <input type="number" min={1} value={getQuantity} onChange={(e) => setGetQuantity(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
                <select value={getItemType} onChange={(e) => setGetItemType(e.target.value as typeof getItemType)} className="rounded-md border border-gray-200 px-2 py-1 text-sm">
                  <option value="all">Alla produkter</option>
                  <option value="product">Specifika produkter</option>
                  <option value="collection">Specifika kollektioner</option>
                </select>
              </div>
              <DiscountItemPicker itemType={getItemType} selected={getItems} onChange={setGetItems} allCollections={allCollections} />
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-gray-500">Procent rabatt på dessa</label>
                <input type="number" min={1} max={100} value={getPercentage} onChange={(e) => setGetPercentage(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">Max antal tillämpningar per order (lämna tomt för obegränsat)</label>
              <input
                type="number"
                min={1}
                value={usesPerOrderLimit}
                onChange={(e) => setUsesPerOrderLimit(e.target.value)}
                className="mt-1 w-24 rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kombinationer</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={combinesWithOrder} onChange={(e) => setCombinesWithOrder(e.target.checked)} /> Kan kombineras med andra ordernivå-rabatter</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={combinesWithProduct} onChange={(e) => setCombinesWithProduct(e.target.checked)} /> Kan kombineras med andra produktrabatter</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={combinesWithShipping} onChange={(e) => setCombinesWithShipping(e.target.checked)} /> Kan kombineras med fraktrabatter</label>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Användningsgränser</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Max totalt antal användningar</label>
            <input type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Obegränsat" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={appliesOncePerCustomer} onChange={(e) => setAppliesOncePerCustomer(e.target.checked)} /> Endast en gång per kund
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schemaläggning</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Startar</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Slutar (valfritt)</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs text-gray-400">Status sätts automatiskt mellan "Schemalagd" → "Aktiv" → "Utgången" baserat på dessa datum (kontrolleras varje gång rabattlistan laddas).</p>
      </div>

      {message && <div className="text-sm text-emerald-600">{message}</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {isPending ? "Sparar…" : "Spara"}
          </button>
          <button
            type="button"
            onClick={syncNow}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Synka till Shopify nu
          </button>
        </div>
        {!showDelete ? (
          <button type="button" onClick={() => setShowDelete(true)} className="text-xs font-medium text-rose-700 underline hover:text-rose-900">
            Radera permanent…
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={`Skriv "${title}" för att bekräfta`}
              className="rounded-md border border-rose-300 px-3 py-1.5 text-sm"
            />
            <button type="button" onClick={confirmDelete} disabled={isPending || deleteConfirmText !== title} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Radera permanent
            </button>
            <button type="button" onClick={() => setShowDelete(false)} className="text-xs text-gray-500">
              Avbryt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
