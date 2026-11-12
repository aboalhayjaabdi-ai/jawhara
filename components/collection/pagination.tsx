"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PaginationPending } from "./pagination-pending";

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

const SCROLL_FLAG = "jawhara_pagination_scroll";
function markPaginationClick() {
  try {
    sessionStorage.setItem(SCROLL_FLAG, "1");
  } catch {
    // storage unavailable -- the page still changes, it just won't scroll to the filter
  }
}

export function Pagination({
  currentPage,
  totalPages,
  gridAnchorId,
  basePath,
  sort,
}: {
  currentPage: number;
  totalPages: number;
  gridAnchorId: string;
  /** e.g. /collections/armband -- links are built from props (not the URL) so they're present in
   * the server-rendered HTML of the statically generated default view too. */
  basePath: string;
  sort: string;
}) {

  // After a click on one of these links, bring the sort filter to the top of the screen once the
  // new page is shown. A flag set by the click (not "the page number changed") decides it: page 1
  // and page 2+ are different routes, so this component remounts and can't compare with before --
  // and landing directly on a shared ?page=3 link must not scroll the viewport.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SCROLL_FLAG) !== "1") return;
      sessionStorage.removeItem(SCROLL_FLAG);
    } catch {
      return;
    }
    document.getElementById(gridAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage, gridAnchorId]);

  if (totalPages <= 1) return null;

  function hrefFor(page: number): string {
    const params = new URLSearchParams();
    if (sort && sort !== "manual") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const pages = getPageNumbers(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label="Sidnumrering" className="mt-14 flex items-center justify-center gap-1.5">
      {hasPrev ? (
        <Link
          href={hrefFor(currentPage - 1)}
          scroll={false}
          onClick={markPaginationClick}
          aria-label="Föregående sida"
          className="btn-fx relative flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
        >
          ‹
          <PaginationPending>‹</PaginationPending>
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
            scroll={false}
            onClick={markPaginationClick}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              p === currentPage
                ? "btn-fx relative flex h-9 min-w-9 items-center justify-center border border-fg bg-fg px-2 text-xs font-semibold text-bg"
                : "btn-fx relative flex h-9 min-w-9 items-center justify-center border border-line px-2 text-xs font-semibold"
            }
          >
            {p}
            {p !== currentPage && <PaginationPending>{p}</PaginationPending>}
          </Link>
        )
      )}

      {hasNext ? (
        <Link
          href={hrefFor(currentPage + 1)}
          scroll={false}
          onClick={markPaginationClick}
          aria-label="Nästa sida"
          className="btn-fx relative flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
        >
          ›
          <PaginationPending>›</PaginationPending>
        </Link>
      ) : (
        <span aria-hidden className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm text-muted opacity-40">
          ›
        </span>
      )}
    </nav>
  );
}
