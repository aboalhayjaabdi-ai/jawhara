import Link from "next/link";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";

// Real footer/social menus, from data/exports/menus.jsonl (handles: footer, connect, om-oss, villkor).
const FOOTER_LINKS = [
  { title: "Startsida", href: "/pages/startsida" },
  { title: "Kontakta oss", href: "/pages/contact" },
  // Real link was the ParcelPanel order-tracking app (/apps/parcelpanel) -- that's a
  // third-party logistics integration not yet migrated (later-phase work), so it would
  // 404 today. Pointing it at Contact in the meantime rather than leaving a dead link.
  { title: "Spåra din beställning", href: "/pages/contact" },
  { title: "Vanliga frågor", href: "/pages/vanliga-fragor" },
];
const ABOUT_LINKS = [{ title: "Om oss", href: "/pages/om-oss" }];
const TERMS_LINKS = [
  { title: "Köpvillkor", href: "/pages/aterbetalningspolicy" },
  { title: "Användarvillkor", href: "/pages/anvandarvillkor" },
];
const SOCIAL_LINKS = [
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

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-10 px-6 py-16 lg:grid-cols-5 lg:px-14">
        <LinkColumn heading="Hjälp" links={FOOTER_LINKS} />
        <LinkColumn heading="Om Jawhara" links={ABOUT_LINKS} />
        <LinkColumn heading="Villkor" links={TERMS_LINKS} />
        <LinkColumn heading="Följ oss" links={SOCIAL_LINKS} />
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
