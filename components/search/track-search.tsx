"use client";

import { useEffect, useRef } from "react";
import { trackSearch } from "@/lib/marketing/events";

/** Fires Meta/GA4 Search once per distinct query on the search results page. */
export function TrackSearch({ query, resultIds }: { query: string; resultIds: string[] }) {
  const lastQuery = useRef<string | null>(null);
  useEffect(() => {
    if (!query || lastQuery.current === query) return;
    lastQuery.current = query;
    trackSearch({ query, resultIds });
  }, [query, resultIds]);
  return null;
}
