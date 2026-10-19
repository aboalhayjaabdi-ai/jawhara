"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualOrder, type ManualOrderLineInput } from "@/app/admin/(authenticated)/orders/new/actions";

type ProductVariant = { id: string; title: string; sku: string | null; price: number; compare_at_price: number | null };
type Product = { id: string; title: string; product_variants: ProductVariant[] };

type Line = ManualOrderLineInput & { title: string; variantTitle: string };

export function ManualOrderForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.products ?? []);
    } finally {
      setSearching(false);
    }
  }

  function addLine(product: Product, variant: ProductVariant) {
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
        unitPrice: Number(variant.price),
        title: product.title,
        variantTitle: variant.title === "Default Title" ? "" : variant.title,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("Lägg till minst en artikel.");
      return;
    }
    startTransition(async () => {
      const result = await createManualOrder({
        email,
        note: note || undefined,
        items: lines.map(({ productId, variantId, quantity, unitPrice }) => ({ productId, variantId, quantity, unitPrice })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/orders/${result.orderId}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Kund</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-post"
          type="email"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Artiklar</div>

        <div className="relative">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Sök produkt…"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          {searching && <div className="mt-1 text-xs text-gray-400">Söker…</div>}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              {results.map((product) => (
                <div key={product.id} className="border-b border-gray-100 last:border-0">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-900">{product.title}</div>
                  {product.product_variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => addLine(product, v)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="text-gray-700">{v.title === "Default Title" ? "Standard" : v.title}</span>
                      <span className="text-gray-500">{v.price} kr</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-gray-900">
                {line.title} {line.variantTitle && <span className="text-gray-400">({line.variantTitle})</span>}
              </span>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Math.max(1, Number(e.target.value)) })}
                className="w-16 rounded-md border border-gray-200 px-2 py-1 text-right text-sm"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: Math.max(0, Number(e.target.value)) })}
                className="w-20 rounded-md border border-gray-200 px-2 py-1 text-right text-sm"
              />
              <button type="button" onClick={() => removeLine(i)} className="text-xs text-rose-600 hover:text-rose-700">
                Ta bort
              </button>
            </div>
          ))}
          {lines.length === 0 && <div className="text-sm text-gray-400">Inga artiklar tillagda.</div>}
        </div>

        {lines.length > 0 && (
          <div className="mt-4 flex justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900">
            <span>Totalt</span>
            <span>{total} kr</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Betalning</div>
        <p className="text-sm text-gray-500">Ordern markeras som redan betald (kassa via Stripe är borttagen).</p>

        <div className="mt-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anteckning (valfritt)"
            className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Skapar…" : "Skapa order"}
        </button>
      </div>
    </div>
  );
}
