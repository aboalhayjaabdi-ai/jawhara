"use client";

import { useLinkStatus } from "next/link";

// Must be rendered as a descendant of a next/link <Link> -- useLinkStatus() reads that Link's own
// pending state (true while its navigation's data is being fetched, false once it's ready/instant
// from cache). A single shared component so every product-card-style link across the site (home
// sections, collection grids, search, related/complementary products, recently viewed) shows the
// exact same subtle feedback the instant a click registers, instead of looking unresponsive while
// the server renders the next page.
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 flex items-center justify-center bg-bg/40 backdrop-blur-[1px]"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-fg/30 border-t-fg" />
    </div>
  );
}
