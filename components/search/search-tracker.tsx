"use client";

import { useEffect, useRef } from "react";
import { trackSearch } from "@/lib/marketing/events";

export function SearchTracker({ query, resultCount }: { query: string; resultCount: number }) {
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!query || lastTracked.current === query) return;
    lastTracked.current = query;
    trackSearch({ query, resultCount });
  }, [query, resultCount]);

  return null;
}
