"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

export type NavItem = { title: string; href: string };

const GAP_PX = 28; // must match the gap-7 utility used below
const SAFETY_PX = 4; // small buffer against sub-pixel rounding

/**
 * Overflow-aware nav: measures real rendered widths (no fixed breakpoints),
 * shows as many items as fit the available column, and collapses the rest
 * into a "MER" dropdown. The container is a 1fr grid column, so its width
 * depends only on the viewport/logo, never on how many items we render
 * inside it -- that keeps ResizeObserver from fighting its own output.
 */
export function PriorityNav({ items }: { items: NavItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreMeasureRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const moreEl = moreMeasureRef.current;
    if (!container || !measure || !moreEl) return;

    const available = container.offsetWidth - SAFETY_PX;
    const itemEls = Array.from(measure.children) as HTMLElement[];
    const widths = itemEls.map((el) => el.offsetWidth);
    const moreWidth = moreEl.offsetWidth;

    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + GAP_PX * Math.max(0, widths.length - 1);

    if (totalWidth <= available) {
      setVisibleCount(items.length);
      return;
    }

    // Reserve room for the "MER" button, then fit as many leading items as possible.
    let used = moreWidth;
    let count = 0;
    for (let i = 0; i < widths.length; i++) {
      const next = used + (count > 0 ? GAP_PX : 0) + widths[i] + GAP_PX; // + gap before MER
      if (next > available) break;
      used += (count > 0 ? GAP_PX : 0) + widths[i];
      count++;
    }
    setVisibleCount(count);
  }, [items.length]);

  useEffect(() => {
    recalculate();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => recalculate());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalculate]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = items.slice(visibleCount);

  return (
    <div ref={containerRef} className="relative min-w-0">
      {/* Visible nav -- deliberately NOT clipped, so the MER dropdown panel can render below it. */}
      <nav aria-label="Huvudmeny" className="flex items-center gap-7 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide">
        {visibleItems.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap">
            {item.title}
          </Link>
        ))}

        {overflowItems.length > 0 && (
          <div ref={rootRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setIsOpen((v) => !v)}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              MER
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div role="menu" className="absolute left-0 top-full z-50 mt-3 min-w-[180px] border border-line bg-bg py-2 shadow-sm">
                {overflowItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="block px-4 py-2.5 normal-case tracking-normal hover:bg-[#f4f4f4]"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Hidden measurement row, isolated in its own clipped/zero-height box so it can
          never expand page scrollWidth -- clipping this box has no effect on the
          dropdown above, which lives in a separate, unclipped element. */}
      <div className="pointer-events-none absolute left-0 top-0 h-0 w-full overflow-hidden" aria-hidden>
        <div
          ref={measureRef}
          className="invisible inline-flex items-center gap-7 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide"
        >
          {items.map((item) => (
            <span key={item.href} className="whitespace-nowrap">
              {item.title}
            </span>
          ))}
        </div>
        <span
          ref={moreMeasureRef}
          className="invisible inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide"
        >
          MER <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden />
        </span>
      </div>
    </div>
  );
}
