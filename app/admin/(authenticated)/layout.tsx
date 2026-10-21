import { redirect } from "next/navigation";
import { getAdminSessionForLayout } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // middleware.ts already checks admin_users membership before reaching here too -- this is the
  // second of three layers (middleware, this page-load check, and requireAdmin() re-checked
  // inside every mutating Server Action/route -- see lib/admin/auth.ts), kept even though
  // middleware now covers the same ground, since a single layer is never trusted alone. Uses
  // getAdminSessionForLayout()'s React-cache()-wrapped lookup rather than its own
  // getUser()+admin_users call: when the page below also calls requireAdmin() directly (orders/
  // products/dashboard/etc.), that previously meant 2 separate network round-trips to Supabase
  // Auth plus 2 admin_users queries for the identical question in the SAME render; this makes it 1.
  const { user, adminRow } = await getAdminSessionForLayout();

  let role: "admin" | "staff" | "fulfillment_staff" = "admin";
  let locale: "sv" | "zh" = "sv";
  if (user) {
    if (!adminRow || adminRow.disabled) {
      redirect("/admin/login");
    }
    role = adminRow.role as "admin" | "staff" | "fulfillment_staff";
    locale = (adminRow.locale as "sv" | "zh") ?? "sv";
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar role={role} locale={locale} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar email={user?.email ?? null} role={role} />
        <main className="flex-1 px-5 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>
      <AdminMobileNav email={user?.email ?? null} role={role} locale={locale} />
    </div>
  );
}
