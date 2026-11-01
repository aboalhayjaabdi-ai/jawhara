"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// Real theme (blocks/_product-media-gallery.liquid + assets/slideshow.js): native
// overflow-x scroll-snap drives real touch swipe, with a numeric counter ("1/5") and prev/next
// arrows -- the real slideshow_controls_style is "counter" on every template, never "thumbnails",
// so true clickable thumbnails were never actually live on the real site. "grid" layout templates
// additionally show a static stacked image grid on desktop (>=1024px) that becomes this same
// carousel below that breakpoint; "carousel" layout templates use the carousel at every breakpoint.
export function ProductGallery({
  images,
  title,
  layout,
  jumpToIndex,
}: {
  images: string[];
  title: string;
  layout: "carousel" | "grid";
  /** When set (e.g. on variant/color selection), scrolls the gallery to this image index. */
  jumpToIndex?: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollToIndex(index: number, behavior: ScrollBehavior = "smooth") {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(images.length - 1, index));
    track.scrollTo({ left: clamped * track.clientWidth, behavior });
  }

  useEffect(() => {
    if (jumpToIndex == null) return;
    scrollToIndex(jumpToIndex);
    setActiveIndex(jumpToIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToIndex]);

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActiveIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  if (images.length === 0) return null;

  const carousel = (
    <div className={`relative ${layout === "grid" ? "lg:hidden" : ""}`}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {images.map((img, i) => (
          <div key={img + i} className="relative w-full shrink-0 snap-center bg-[#f4f4f4]">
            <Image src={img} alt={title} fill priority={i === 0} sizes="(min-width: 1024px) 55vw, 100vw" className="object-contain" />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-bg/90 px-2.5 py-1 text-[10px] font-semibold">
            {activeIndex + 1}/{images.length}
          </div>
          <button
            type="button"
            aria-label="Föregående bild"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center bg-bg/90 disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button
            type="button"
            aria-label="Nästa bild"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === images.length - 1}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center bg-bg/90 disabled:opacity-30"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </>
      )}
    </div>
  );

  if (layout === "carousel") return carousel;

  return (
    <>
      {carousel}
      {/* A single image in a 2-column grid only ever fills the first cell, leaving the second one
          (and the rest of the gallery's intended width) visibly blank on desktop -- full-width
          instead once there's nothing to actually show side by side, matching the mobile
          carousel's own treatment of a single image above. */}
      {images.length === 1 ? (
        <div className="relative hidden aspect-square w-full overflow-hidden bg-[#f4f4f4] lg:block">
          <Image src={images[0]} alt={title} fill priority sizes="55vw" className="object-contain" />
        </div>
      ) : (
        <div className="hidden w-full gap-3 lg:grid lg:grid-cols-2">
          {images.map((img, i) => (
            <div key={img + i} className="relative aspect-square overflow-hidden bg-[#f4f4f4]">
              <Image src={img} alt={title} fill priority={i === 0} sizes="27vw" className="object-contain" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
