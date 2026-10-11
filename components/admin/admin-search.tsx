"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SearchResults = {
  products: { id: string; title: string; handle: string; status: string }[];
  orders: { id: string; order_number: string; email: string | null; total_price: number; currency_code: string }[];
  customers: { id: string; first_name: string | null; last_name: string | null; email: string | null }[];
};

function formatMoney(amount: number, currency: string) {
  return `${Math.round(amount)} ${currency}`;
}

export function AdminSearchField({ dark = false, onNavigate }: { dark?: boolean; onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const hasResults = !!results && (results.products.length > 0 || results.orders.length > 0 || results.customers.length > 0);

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${dark ? "bg-gray-900" : "border border-gray-200 bg-gray-50"}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={dark ? "text-gray-500" : "text-gray-400"} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.6" y2="16.6" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Sök produkter, ordrar, kunder..."
          className={`w-full bg-transparent text-sm outline-none ${dark ? "text-gray-100 placeholder:text-gray-500" : "text-gray-900 placeholder:text-gray-400"}`}
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white py-2 text-left shadow-lg">
          {loading && <div className="px-4 py-3 text-sm text-gray-400">Söker…</div>}
          {!loading && !hasResults && <div className="px-4 py-3 text-sm text-gray-400">Inga träffar.</div>}

          {!loading && results && results.orders.length > 0 && (
            <div className="mb-1">
              <div className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ordrar</div>
              {results.orders.map((o) => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} onClick={close} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50">
                  <span className="font-medium text-gray-900">{o.order_number}</span>
                  <span className="text-gray-400">{formatMoney(o.total_price, o.currency_code)}</span>
                </Link>
              ))}
            </div>
          )}

          {!loading && results && results.products.length > 0 && (
            <div className="mb-1">
              <div className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Produkter</div>
              {results.products.map((p) => (
                <a
                  key={p.id}
                  href={`/products/${p.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={close}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{p.title}</span>
                  <span className="text-gray-400">Visa på webbplatsen ↗</span>
                </a>
              ))}
            </div>
          )}

          {!loading && results && results.customers.length > 0 && (
            <div>
              <div className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Kunder</div>
              {results.customers.map((c) => (
                <div key={c.id} className="px-4 py-2 text-sm">
                  <div className="font-medium text-gray-900">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-xs text-gray-400">{c.email}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
