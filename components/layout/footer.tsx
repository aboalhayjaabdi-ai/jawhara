import Link from "next/link";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";
import type { NavLink } from "@/lib/queries";

// Fallback only -- the real content now lives in `storefront_menus`/`storefront_menu_items`,
// editable via /admin/storefront/menus, originally seeded verbatim from these exact lists
// (migration 0021_phase7_storefront_seed.sql, read from data/exports/menus.jsonl at the time).
const FALLBACK_FOOTER_LINKS: NavLink[] = [
  { title: "Startsida", href: "/pages/startsida" },
  { title: "Kontakta oss", href: "/pages/contact" },
  { title: "Spåra din beställning", href: "/pages/contact" },
  { title: "Vanliga frågor", href: "/pages/vanliga-fragor" },
];
const FALLBACK_ABOUT_LINKS: NavLink[] = [{ title: "Om oss", href: "/pages/om-oss" }];
const FALLBACK_TERMS_LINKS: NavLink[] = [
  { title: "Köpvillkor", href: "/pages/aterbetalningspolicy" },
  { title: "Användarvillkor", href: "/pages/anvandarvillkor" },
];
const FALLBACK_SOCIAL_LINKS: NavLink[] = [
  { title: "Instagram", href: "https://www.instagram.com/jawharasverige" },
  { title: "TikTok", href: "https://www.tiktok.com/@jawhara.sverige" },
  { title: "Facebook", href: "https://www.facebook.com/profile.php?id=61590794971964&locale=sv_SE" },
];

function LinkColumn({ heading, links }: { heading: string; links: { title: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{heading}</div>
      {links.map((l) => (
        <Link key={l.title} href={l.href} className="text-sm">
          {l.title}
        </Link>
      ))}
    </div>
  );
}

export function Footer({
  footerLinks,
  aboutLinks,
  termsLinks,
  socialLinks,
}: {
  footerLinks?: NavLink[];
  aboutLinks?: NavLink[];
  termsLinks?: NavLink[];
  socialLinks?: NavLink[];
}) {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-10 px-6 py-16 lg:grid-cols-5 lg:px-14">
        <LinkColumn heading="Hjälp" links={footerLinks?.length ? footerLinks : FALLBACK_FOOTER_LINKS} />
        <LinkColumn heading="Om Jawhara" links={aboutLinks?.length ? aboutLinks : FALLBACK_ABOUT_LINKS} />
        <LinkColumn heading="Villkor" links={termsLinks?.length ? termsLinks : FALLBACK_TERMS_LINKS} />
        <LinkColumn heading="Följ oss" links={socialLinks?.length ? socialLinks : FALLBACK_SOCIAL_LINKS} />
        <div className="col-span-2 lg:col-span-1">
          <NewsletterSignup />
        </div>
      </div>
      <div className="border-t border-line px-6 py-6 text-center text-xs text-muted lg:px-14">
        © {new Date().getFullYear()} Jawhara
      </div>
    </footer>
  );
}
