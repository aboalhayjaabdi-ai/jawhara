import type { AdminLocale, AdminRole } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";

// Only pages that genuinely exist and work today. Extend this list as each new admin section is
// actually built (products, customers, collections, etc. per the approved roadmap) -- never add a
// link here ahead of the page it points to.
export const ADMIN_NAV = [
  { href: "/admin", label: "Översikt" },
  { href: "/admin/orders", label: "Ordrar" },
  { href: "/admin/customers", label: "Kunder" },
  { href: "/admin/products", label: "Produkter" },
  { href: "/admin/collections", label: "Kollektioner" },
  { href: "/admin/discounts", label: "Rabatter" },
  { href: "/admin/reviews", label: "Recensioner" },
  { href: "/admin/storefront", label: "Webbutik" },
  { href: "/admin/content", label: "Innehåll" },
  { href: "/admin/email-templates", label: "E-postmallar" },
  { href: "/admin/product-templates", label: "Produktmallar" },
  { href: "/admin/products/inventory", label: "Lager" },
  { href: "/admin/settings", label: "Inställningar" },
  { href: "/admin/staff", label: "Personal" },
  { href: "/admin/audit-log", label: "Aktivitetslogg" },
  { href: "/admin/security", label: "Säkerhet" },
];

/**
 * The restricted "fulfillment_staff" role (see lib/admin/permissions.ts) only ever reaches
 * Orders + Products -- every other ADMIN_NAV entry above is unreachable for it and must not even
 * be offered as a link. Labels follow the account's own language preference.
 */
export function getAdminNav(role: AdminRole, locale: AdminLocale): { href: string; label: string }[] {
  if (role !== "fulfillment_staff") return ADMIN_NAV;
  return [
    { href: "/admin/orders", label: t(locale, "nav.orders") },
    { href: "/admin/products", label: t(locale, "nav.products") },
  ];
}
