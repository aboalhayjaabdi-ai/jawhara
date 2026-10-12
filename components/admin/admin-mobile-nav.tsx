"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminLocale, AdminRole } from "@/lib/admin/auth";
import { getAdminNav } from "./admin-nav";
import { AdminSearchField } from "./admin-search";
import { t } from "@/lib/admin/i18n";

// Fixed bottom-left floating trigger opening a full-height dark drawer -- matches the reference
// Shopify-mobile-admin screenshots (not a conventional top-left hamburger).
export function AdminMobileNav({ email, role, locale }: { email: string | null; role: AdminRole; locale: AdminLocale }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navItems = getAdminNav(role, locale);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Öppna meny"
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gray-950 text-white shadow-lg lg:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col bg-gray-950 text-gray-300 transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-shrink-0 items-center justify-between px-5 pt-6">
          <span className="font-serif text-xl text-white">Jawhara</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Stäng meny"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {email && <div className="flex-shrink-0 px-5 pt-3 text-xs text-gray-500">{email}</div>}

        {role !== "fulfillment_staff" && (
          <div className="flex-shrink-0 px-5 pt-5">
            <AdminSearchField dark onNavigate={() => setOpen(false)} />
          </div>
        )}

        <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-base ${
                  active ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-900 hover:text-white"
                }`}
              >
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-white" : "bg-gray-700"}`} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-gray-800 p-5">
          <form action="/admin/signout" method="POST">
            <button type="submit" className="text-sm text-gray-400 hover:text-white">
              {t(locale, "nav.signOut")}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
