"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import {
  bulkSetStatus,
  bulkAddTags,
  bulkRemoveTags,
  bulkAddToCollection,
  bulkRemoveFromCollection,
  bulkAdjustPrice,
  bulkDelete,
} from "@/app/admin/(authenticated)/products/actions/bulk";

export type ProductRow = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  source: "shopify" | "manual";
  thumbnailUrl: string | null;
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  totalInventory: number;
};

const STATUS_LABEL: Record<string, string> = { active: "Aktiv", draft: "Utkast", archived: "Arkiverad" };

function formatPriceRange(min: number | null, max: number | null) {
  if (min == null) return "—";
  if (min === max) return `${Math.round(min)} kr`;
  return `${Math.round(min)}–${Math.round(max!)} kr`;
}

type BulkAction = "status" | "tags-add" | "tags-remove" | "collection-add" | "collection-remove" | "price" | "delete";

export function ProductsTable({ products, collections }: { products: ProductRow[]; collections: { id: string; title: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<BulkAction | "">("");
  const [status, setStatus] = useState<"active" | "draft" | "archived">("archived");
  const [tagsInput, setTagsInput] = useState("");
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [priceMode, setPriceMode] = useState<"percent" | "amount">("percent");
  const [priceValue, setPriceValue] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run() {
    setMessage(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      let result: { ok: boolean; count?: number; error?: string; skipped?: string[] };
      switch (action) {
        case "status":
          result = await bulkSetStatus(ids, status);
          break;
        case "tags-add":
          result = await bulkAddTags(ids, tagsInput.split(",").map((t) => t.trim()).filter(Boolean));
          break;
        case "tags-remove":
          result = await bulkRemoveTags(ids, tagsInput.split(",").map((t) => t.trim()).filter(Boolean));
          break;
        case "collection-add":
          result = await bulkAddToCollection(ids, collectionId);
          break;
        case "collection-remove":
          result = await bulkRemoveFromCollection(ids, collectionId);
          break;
        case "price":
          result = await bulkAdjustPrice(ids, { mode: priceMode, value: priceValue, applyToCompareAt: false });
          break;
        case "delete":
          result = await bulkDelete(ids, confirmDelete);
          break;
        default:
          return;
      }
      if (result.ok) {
        setMessage(`Klart: ${result.count} produkt(er) uppdaterade${result.skipped?.length ? `, ${result.skipped.length} hoppades över` : ""}.`);
        setSelected(new Set());
        setAction("");
        setConfirmDelete(false);
      } else {
        setMessage(result.error ?? "Åtgärden misslyckades.");
      }
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-700">{selected.size} valda</span>
            <select value={action} onChange={(e) => setAction(e.target.value as BulkAction)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
              <option value="">Välj åtgärd…</option>
              <option value="status">Ändra status</option>
              <option value="tags-add">Lägg till taggar</option>
              <option value="tags-remove">Ta bort taggar</option>
              <option value="collection-add">Lägg till i kollektion</option>
              <option value="collection-remove">Ta bort från kollektion</option>
              <option value="price">Justera pris</option>
              <option value="delete">Radera</option>
            </select>

            {action === "status" && (
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                <option value="active">Aktiv</option>
                <option value="draft">Utkast</option>
                <option value="archived">Arkiverad</option>
              </select>
            )}
            {(action === "tags-add" || action === "tags-remove") && (
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="komma, separerade, taggar" className="rounded-md border border-gray-200 px-2 py-1 text-xs" />
            )}
            {(action === "collection-add" || action === "collection-remove") && (
              <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
            {action === "price" && (
              <>
                <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as any)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <option value="percent">Procent</option>
                  <option value="amount">Belopp (kr)</option>
                </select>
                <input
                  type="number"
                  value={priceValue}
                  onChange={(e) => setPriceValue(Number(e.target.value))}
                  className="w-20 rounded-md border border-gray-200 px-2 py-1 text-xs"
                />
              </>
            )}
            {action === "delete" && (
              <label className="flex items-center gap-1 text-xs text-rose-700">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                Bekräfta permanent radering
              </label>
            )}

            {action && (
              <button
                type="button"
                onClick={run}
                disabled={isPending}
                className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isPending ? "Bearbetar…" : "Verkställ"}
              </button>
            )}
          </div>
          {message && <div className="mt-2 text-xs text-gray-600">{message}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(products.map((p) => p.id)) : new Set())}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </th>
              <th className="px-2 py-3"></th>
              <th className="px-5 py-3">Produkt</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Leverantör</th>
              <th className="px-5 py-3">Pris</th>
              <th className="px-5 py-3">Lager</th>
              <th className="px-5 py-3">Källa</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-gray-300" />
                </td>
                <td className="px-2 py-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded bg-gray-100">
                    {p.thumbnailUrl && <Image src={p.thumbnailUrl} alt="" fill className="object-cover" sizes="40px" />}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/products/${p.id}`} prefetch={false} className="font-medium text-gray-900 hover:underline">
                    {p.title}
                  </Link>
                  <div className="text-xs text-gray-400">{p.variantCount} variant{p.variantCount === 1 ? "" : "er"}</div>
                </td>
                <td className="px-5 py-3 text-gray-500">{STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="px-5 py-3 text-gray-500">{p.vendor || "—"}</td>
                <td className="px-5 py-3 text-gray-900">{formatPriceRange(p.minPrice, p.maxPrice)}</td>
                <td className="px-5 py-3 text-gray-500">{p.totalInventory}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      p.source === "shopify" ? "bg-gray-100 text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {p.source === "shopify" ? "Shopify" : "Manuell"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Inga produkter hittades.</p>}
      </div>
    </div>
  );
}
