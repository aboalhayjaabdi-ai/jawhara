"use client";

import { useLinkStatus } from "next/link";

// Rendered inside each pagination <Link> (which must be `relative`). The moment a page link is
// clicked it fills black with a short press animation and pulses softly until the next page is
// ready -- otherwise nothing visibly happened between the tap and the new page rendering.
export function PaginationPending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className="pagination-pending absolute -inset-px flex items-center justify-center bg-fg text-bg">
      {children}
    </span>
  );
}
