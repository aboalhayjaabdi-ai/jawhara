"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Standard "windowed" page-number algorithm: always shows the first and last page, plus one
// page on either side of the current page, collapsing any gap into a single "…". Keeps the row
// short (at most 7 slots) even for the largest real collection (/collections/all, 376 products /
// 24 per page = 16 pages), so it never wraps or needs horizontal scroll on mobile.
function getPageNumbers(current: number, total: number): (number | "...")[] {
  const delta = 1;
  const range: (number | "...")[] = [];
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  range.push(1);
  if (left > 2) range.push("...");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("...");
  if (total > 1) range.push(total);

  return range;
}

export function Pagination({
  currentPage,
  totalPages,
  gridAnchorId,
}: {
  currentPage: number;
  totalPages: number;
  gridAnchorId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Scroll to the top of the product grid whenever the page actually changes -- but not on the
  // component's own first mount (landing directly on a shared ?page=3 link shouldn't yank the
  // viewport). Same skip-on-mount pattern already used elsewhere in this codebase (e.g. the
  // add-to-cart pop animation's useJustAdded hook).
  const prevPage = useRef(currentPage);
  useEffect(() => {
    if (prevPage.current === currentPage) return;
    prevPage.current = currentPage;
    document.getElementById(gridAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage, gridAnchorId]);

  if (totalPages <= 1) return null;

  function hrefFor(page: number): string {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const pages = getPageNumbers(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label="Sidnumrering" className="mt-14 flex items-center justify-center gap-1.5">
      {hasPrev ? (
        <Link
          href={hrefFor(currentPage - 1)}
          aria-label="Föregående sida"
          className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
        >
          ‹
        </Link>
      ) : (
        <span aria-hidden className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm text-muted opacity-40">
          ‹
        </span>
      )}

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="flex h-9 min-w-9 items-center justify-center text-xs text-muted">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              p === currentPage
                ? "flex h-9 min-w-9 items-center justify-center border border-fg bg-fg px-2 text-xs font-semibold text-bg"
                : "flex h-9 min-w-9 items-center justify-center border border-line px-2 text-xs font-semibold"
            }
          >
            {p}
          </Link>
        )
      )}

      {hasNext ? (
        <Link
          href={hrefFor(currentPage + 1)}
          aria-label="Nästa sida"
          className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
        >
          ›
        </Link>
      ) : (
        <span aria-hidden className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm text-muted opacity-40">
          ›
        </span>
      )}
    </nav>
  );
}
