"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReview } from "@/app/admin/(authenticated)/reviews/new/actions";

type ProductResult = { id: string; title: string };

export function NewReviewForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [rating, setRating] = useState(5);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("approved");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults((data.products ?? []).map((p: any) => ({ id: p.id, title: p.title })));
    } finally {
      setIsSearching(false);
    }
  }

  function submit() {
    setError(null);
    if (!selectedProduct) {
      setError("Välj en produkt.");
      return;
    }
    startTransition(async () => {
      const result = await createReview({
        productId: selectedProduct.id,
        rating,
        authorName: authorName || null,
        body: body || null,
        customerEmail: customerEmail || null,
        status,
      });
      if (result.ok) router.push(`/admin/reviews/${result.reviewId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <label className="text-xs text-gray-500">Produkt</label>
        {selectedProduct ? (
          <div className="mt-1 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span>{selectedProduct.title}</span>
            <button type="button" onClick={() => setSelectedProduct(null)} className="text-xs text-gray-500 underline">
              Byt
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Sök produkt…"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            {isSearching && <div className="mt-1 text-xs text-gray-400">Söker…</div>}
            {results.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-200">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p);
                      setResults([]);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Betyg</label>
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} stjärn{n === 1 ? "a" : "or"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
            <option value="approved">Godkänd (publiceras direkt)</option>
            <option value="pending">Väntar på granskning</option>
            <option value="rejected">Avvisad</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500">Författare</label>
        <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Anonym" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="text-xs text-gray-500">Text</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="text-xs text-gray-500">Kundens e-post (valfritt)</label>
        <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="namn@exempel.se" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        <p className="mt-1 text-xs text-gray-400">
          Om angiven kontrolleras automatiskt mot riktig orderhistorik om kunden faktiskt köpt produkten -- "Verifierat köp" sätts
          endast när det stämmer, aldrig manuellt.
        </p>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button type="button" onClick={submit} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Skapar…" : "Skapa recension"}
      </button>
    </div>
  );
}
