"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { NavItem } from "@/components/layout/priority-nav";

// Mirrors the real theme's snippets/header-drawer.liquid + assets/header-drawer.js: a native
// <details>/<summary> left-side drawer (click + Enter/Space via the browser's own semantics),
// closed on Escape, with focus trapped inside while open. Real icon is 2 horizontal lines
// (assets/icon-menu.svg), not 3. Real locale strings: "Meny" (menu label), "Primär" (nav
// landmark). The real main-menu has no nested items, so this renders a flat list only.
export function MobileNavDrawer({ items }: { items: NavItem[] }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function close() {
      details!.open = false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && details!.open) {
        close();
        (details!.querySelector("summary") as HTMLElement | null)?.focus();
      }
    }

    function trapFocus(e: KeyboardEvent) {
      if (e.key !== "Tab" || !details!.open || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function onToggle() {
      if (details!.open) {
        document.body.style.overflow = "hidden";
        panelRef.current?.querySelector<HTMLElement>("a")?.focus();
      } else {
        document.body.style.overflow = "";
      }
    }

    details.addEventListener("toggle", onToggle);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", trapFocus);
    return () => {
      details.removeEventListener("toggle", onToggle);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="Meny"
        className="flex h-8 w-8 list-none items-center justify-center [&::-webkit-details-marker]:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M1 3.5H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M1 10.5H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </summary>

      <div
        className="fixed inset-0 top-[68px] z-40 bg-black/30"
        onClick={() => {
          if (detailsRef.current) detailsRef.current.open = false;
        }}
      />
      <div
        ref={panelRef}
        className="fixed inset-y-0 left-0 top-[68px] z-40 w-[82vw] max-w-[320px] overflow-y-auto bg-bg"
      >
        <nav aria-label="Primär" className="flex flex-col py-6">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-6 py-3.5 text-sm font-semibold uppercase tracking-wide"
              onClick={() => {
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              {item.title}
            </Link>
          ))}
        </nav>
      </div>
    </details>
  );
}
