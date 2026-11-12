"use client";

import type { CSSProperties, ImgHTMLAttributes } from "react";

// A client component on purpose: an <img fetchPriority="high"> rendered directly by a server
// component becomes a preload hint in the page's RSC payload, and every other page prefetches the
// homepage (logo link) -- the banner was then downloaded on product/collection pages too. Rendered
// from here, it's only in the homepage's own HTML.
export function HeroPicture({
  mobile,
  desktopSrcSet,
  desktopSizes,
  className,
  style,
}: {
  mobile: ImgHTMLAttributes<HTMLImageElement>;
  desktopSrcSet?: string;
  desktopSizes?: string;
  className: string;
  style: CSSProperties;
}) {
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopSrcSet} sizes={desktopSizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture> built from getImageProps */}
      <img {...mobile} alt={mobile.alt ?? ""} className={className} style={style} />
    </picture>
  );
}
