"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminLocale, AdminRole } from "@/lib/admin/auth";
import { getAdminNav } from "./admin-nav";
import { t } from "@/lib/admin/i18n";

export function AdminSidebar({ role, locale }: { role: AdminRole; locale: AdminLocale }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navItems = getAdminNav(role, locale);

  return (
    <aside
      className={`hidden flex-shrink-0 flex-col bg-gray-950 text-gray-300 transition-[width] duration-200 lg:flex ${
        collapsed ? "w-[72px]" : "w-60"
      }`}
    >
      <div className="flex h-16 flex-shrink-0 items-center justify-between px-4">
        {!collapsed && <span className="truncate font-serif text-lg text-white">Jawhara</span>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandera menyn" : "Komprimera menyn"}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-900 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-900 hover:text-white"
              }`}
            >
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-white" : "bg-gray-700"}`} aria-hidden />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-gray-800 p-3">
        <form action="/admin/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-900 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            {!collapsed && t(locale, "nav.signOut")}
          </button>
        </form>
      </div>
    </aside>
  );
}
