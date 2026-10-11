import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already checks admin_users membership before reaching here too -- this is the
  // second of three layers (middleware, this page-load check, and requireAdmin() re-checked
  // inside every mutating Server Action/route -- see lib/admin/auth.ts), kept even though
  // middleware now covers the same ground, since a page-load check costs nothing extra here and
  // a single layer is never trusted alone.
  if (user) {
    const { data: adminRow } = await supabase.from("admin_users").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!adminRow) {
      redirect("/admin/login");
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar email={user?.email ?? null} />
        <main className="flex-1 px-5 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>
      <AdminMobileNav email={user?.email ?? null} />
    </div>
  );
}
