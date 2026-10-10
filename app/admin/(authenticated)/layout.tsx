import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthServerClient } from "@/lib/supabase/server-auth";

const NAV = [
  { href: "/admin", label: "Översikt" },
  { href: "/admin/products", label: "Produkter" },
  { href: "/admin/collections", label: "Kollektioner" },
  { href: "/admin/inventory", label: "Lager" },
  { href: "/admin/orders", label: "Ordrar" },
  { href: "/admin/customers", label: "Kunder" },
  { href: "/admin/discounts", label: "Rabatter" },
  { href: "/admin/reviews", label: "Recensioner" },
  { href: "/admin/pages", label: "Sidor" },
  { href: "/admin/storefront", label: "Startsida" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already redirects unauthenticated requests before reaching here -- this is the
  // authoritative "is this signed-in user actually an admin" check (RLS-backed: admin_users'
  // policy only returns a row to a caller is_admin() itself already approves).
  if (user) {
    const { data: adminRow } = await supabase.from("admin_users").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!adminRow) {
      redirect("/admin/login");
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 flex-shrink-0 border-r border-line px-5 py-8">
        <div className="mb-8 font-serif text-lg">JAWHARA</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="px-2 py-2 text-sm hover:bg-[#f4f4f4]">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/signout" method="POST" className="mt-8">
          <button type="submit" className="text-xs uppercase tracking-wide text-muted underline">
            Logga ut
          </button>
        </form>
      </aside>
      <main className="flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
