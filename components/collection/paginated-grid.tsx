"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/product/product-card";
import type { ProductCard as ProductCardType } from "@/lib/queries";

const PAGE_SIZE = 24;

type PageData = { products: ProductCardType[]; total: number };

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

/**
 * Owns pagination end-to-end client-side -- clicking a page number used to be a plain <Link> to
 * a new ?page=N, which is a full Next.js RSC navigation: the clicked button's own "active" state
 * is a prop driven by the SERVER's re-render, so nothing on screen could change until that whole
 * round trip finished (no local state existed to update instantly). That's what made clicks feel
 * unregistered. This fetches just the product data (app/api/collections/[handle]/products) and
 * drives everything -- the highlighted button, the URL, and the grid -- from local state instead,
 * so the active page updates the instant it's clicked, independent of how long the fetch takes.
 *
 * Also fixes a second, unrelated bug this surfaced: `total` (and therefore how many page buttons
 * render) must come from the exact same active-product-filtered count the cards query uses --
 * see getCollectionProductCount's fix -- or the last page(s) request an offset past the real
 * data and render empty.
 */
export function PaginatedGrid({
  handle,
  initialProducts,
  initialTotal,
  initialPage,
  gridAnchorId,
}: {
  handle: string;
  initialProducts: ProductCardType[];
  initialTotal: number;
  initialPage: number;
  gridAnchorId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<PageData>({ products: initialProducts, total: initialTotal });
  const [pending, setPending] = useState(false);

  // Keyed by page number -- cleared whenever sort/filter changes (a different query entirely).
  const cache = useRef<Map<number, PageData>>(new Map([[initialPage, { products: initialProducts, total: initialTotal }]]));
  const requestSeq = useRef(0);
  const filterKey = searchParams.toString().replace(/(^|&)page=\d+/, "").replace(/^&/, "");
  const prevFilterKey = useRef(filterKey);

  const apiUrl = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(p));
      return `/api/collections/${handle}/products?${params.toString()}`;
    },
    [handle, searchParams]
  );

  const linkHref = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (p <= 1) params.delete("page");
      else params.set("page", String(p));
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams]
  );

  async function fetchPage(p: number): Promise<PageData> {
    const cached = cache.current.get(p);
    if (cached) return cached;
    const res = await fetch(apiUrl(p));
    const json = (await res.json()) as PageData;
    cache.current.set(p, json);
    return json;
  }

  const goToPage = useCallback(
    (p: number) => {
      if (p === page || p < 1) return;
      setPage(p); // instant highlight, independent of the fetch below
      window.history.pushState(null, "", linkHref(p));

      const mySeq = ++requestSeq.current;
      const cached = cache.current.get(p);
      if (cached) {
        setData(cached);
        setPending(false);
      } else {
        setPending(true);
        fetchPage(p).then((json) => {
          if (requestSeq.current !== mySeq) return; // a later click already superseded this one
          setData(json);
          setPending(false);
        });
      }
      document.getElementById(gridAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [page, linkHref, gridAnchorId]
  );

  // A sort/filter change (SortFilterBar does a real navigation) remounts the server page with
  // fresh initialProducts/initialTotal/initialPage -- resync local state to that and drop the
  // now-stale page cache, which was keyed to the previous filters.
  useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    cache.current = new Map([[initialPage, { products: initialProducts, total: initialTotal }]]);
    requestSeq.current++;
    setPage(initialPage);
    setData({ products: initialProducts, total: initialTotal });
    setPending(false);
  }, [filterKey, initialPage, initialProducts, initialTotal]);

  // Browser back/forward -- read the real URL's page back into local state without pushing a new
  // history entry (the browser already moved the history pointer itself).
  useEffect(() => {
    function onPopState() {
      const p = Math.max(1, Number(new URLSearchParams(window.location.search).get("page") ?? "1") || 1);
      setPage(p);
      const mySeq = ++requestSeq.current;
      const cached = cache.current.get(p);
      if (cached) {
        setData(cached);
        setPending(false);
      } else {
        setPending(true);
        fetchPage(p).then((json) => {
          if (requestSeq.current !== mySeq) return;
          setData(json);
          setPending(false);
        });
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  // Prefetch the adjacent pages in the background once the current page has settled -- clicking
  // next/previous (the overwhelmingly common case) then serves from cache, no network wait at all.
  useEffect(() => {
    if (pending) return;
    for (const p of [page - 1, page + 1]) {
      if (p >= 1 && p <= totalPages && !cache.current.has(p)) {
        fetch(apiUrl(p))
          .then((r) => r.json())
          .then((json: PageData) => cache.current.set(p, json))
          .catch(() => {});
      }
    }
  }, [page, pending, totalPages, apiUrl]);

  const pages = getPageNumbers(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <>
      <div
        id={gridAnchorId}
        className="grid grid-cols-2 gap-6 pt-2 transition-opacity duration-150 lg:grid-cols-4 lg:gap-7"
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        {data.products.map((p) => (
          <ProductCard key={p.handle} product={p} />
        ))}
      </div>

      {data.products.length === 0 && <p className="pt-10 text-center text-sm text-muted">Inga produkter matchar valda filter.</p>}

      {totalPages > 1 && (
        <nav aria-label="Sidnumrering" className="mt-14 flex items-center justify-center gap-1.5">
          {hasPrev ? (
            <a
              href={linkHref(page - 1)}
              aria-label="Föregående sida"
              onClick={(e) => {
                e.preventDefault();
                goToPage(page - 1);
              }}
              className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
            >
              ‹
            </a>
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
              <a
                key={p}
                href={linkHref(p)}
                aria-current={p === page ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goToPage(p);
                }}
                className={
                  p === page
                    ? "flex h-9 min-w-9 items-center justify-center border border-fg bg-fg px-2 text-xs font-semibold text-bg"
                    : "flex h-9 min-w-9 items-center justify-center border border-line px-2 text-xs font-semibold"
                }
              >
                {p}
              </a>
            )
          )}

          {hasNext ? (
            <a
              href={linkHref(page + 1)}
              aria-label="Nästa sida"
              onClick={(e) => {
                e.preventDefault();
                goToPage(page + 1);
              }}
              className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm"
            >
              ›
            </a>
          ) : (
            <span aria-hidden className="flex h-9 min-w-9 items-center justify-center border border-line px-2 text-sm text-muted opacity-40">
              ›
            </span>
          )}
        </nav>
      )}
    </>
  );
}
