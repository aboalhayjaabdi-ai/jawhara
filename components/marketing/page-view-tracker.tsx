"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackPageView } from "@/lib/marketing/events";

/** Fires PageView on every client-side route change after the first one -- the Meta Pixel's own
 * inline init script already fires it once for the very first page load (same script execution,
 * no race), so this intentionally skips its first run to avoid double-counting that one. */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const skippedFirst = useRef(false);

  useEffect(() => {
    if (!skippedFirst.current) {
      skippedFirst.current = true;
      return;
    }
    trackPageView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}
