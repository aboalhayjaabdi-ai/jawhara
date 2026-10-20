"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { getConsent, setConsent, type ConsentState } from "@/lib/marketing/consent";
import { trackPageView } from "@/lib/marketing/events";

/**
 * One combined client component (not split into separate banner/script components) so the
 * consent decision and the conditional script injection share state directly -- clicking
 * "Acceptera" in the banner re-renders this component with consent="accepted" and the Pixel/GA4
 * <Script> tags mount immediately, same page load, no reload needed.
 *
 * Both IDs are real-but-optional strings fetched server-side (lib/admin/marketing-settings.ts's
 * getPublicMarketingIds(), which never selects the CAPI secret column) and passed down as props --
 * when either is empty, that integration's scripts simply never render, regardless of consent.
 */
export function CookieConsentAndTracking({ metaPixelId, ga4MeasurementId }: { metaPixelId: string | null; ga4MeasurementId: string | null }) {
  const [consent, setConsentState] = useState<ConsentState>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConsentState(getConsent());
    setHydrated(true);
  }, []);

  // The pixel's own init script below fires the very first PageView itself the moment it loads
  // (consent accepted) -- this effect covers every page after that. Without it, PageView only
  // ever fired once per full browser load: Next.js App Router navigation between pages (any
  // <Link> click) never reloads the page, so most real pageviews on this site were never being
  // reported at all.
  const pathname = usePathname();
  const skippedFirstRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstRef.current) {
      skippedFirstRef.current = true;
      return;
    }
    trackPageView();
  }, [pathname]);

  function handleAccept() {
    setConsent("accepted");
    setConsentState("accepted");
  }
  function handleReject() {
    setConsent("rejected");
    setConsentState("rejected");
  }

  const trackingActive = consent === "accepted";

  return (
    <>
      {trackingActive && metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {trackingActive && ga4MeasurementId && (
        <>
          <Script id="ga4-lib" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`} />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga4MeasurementId}');
            `}
          </Script>
        </>
      )}

      {hydrated && consent === null && (
        <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-line bg-bg px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] sm:px-6">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-muted sm:text-sm">
              Vi använder cookies för att förbättra din upplevelse och, om du godkänner, för marknadsförings- och
              analysändamål.{" "}
              <a href="/pages/anvandarvillkor" className="underline">
                Läs mer i vår integritetspolicy
              </a>
              .
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={handleReject} className="h-9 px-4 text-xs font-semibold uppercase tracking-wide text-muted hover:text-fg">
                Avvisa
              </button>
              <button type="button" onClick={handleAccept} className="h-9 bg-fg px-4 text-xs font-semibold uppercase tracking-wide text-bg">
                Acceptera
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
