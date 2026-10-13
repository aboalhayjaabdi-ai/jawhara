"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Was a plain <form action="/search">, which submits as a native browser GET request -- a full
// page reload, not a Next.js client-side transition, so every search felt like the whole site had
// frozen for the length of a full document reload. useTransition's isPending drives a subtle
// opacity change (not a layout shift) so typing/submitting still feels immediate, matching the
// pending-state pattern already used for "Till kassan"/discount-code apply in the cart drawer.
export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="mx-auto max-w-lg"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = query.trim();
        startTransition(() => {
          router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
        });
      }}
    >
      <input
        type="search"
        name="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Sök produkter..."
        autoFocus
        className={`h-12 w-full border-b border-fg bg-transparent px-1 text-base outline-none transition-opacity ${isPending ? "opacity-60" : ""}`}
      />
    </form>
  );
}
