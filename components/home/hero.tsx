import { getImageProps } from "next/image";
import Link from "next/link";
import { preload } from "react-dom";

type HeroProps = {
  desktopImage: string;
  mobileImage?: string;
  buttonText: string;
  buttonHref: string;
  height?: string;
  /** Optional separate height below the md breakpoint (CSS length). When unset, mobile keeps the
   * original behavior: `height` capped to what the 585:1040 mobile image covers without cropping. */
  mobileHeight?: string;
  /** Optional CSS object-position for the mobile image, e.g. "50% 25%" to keep text near the top of
   * the image in frame when mobileHeight crops it. Only changes how the image is framed, never the file. */
  mobileObjectPosition?: string;
  /** "contain": the whole image is always shown, never cropped (letterboxed on black where the
   * banner's shape differs from the image's). Default "cover" fills the banner, cropping edges. */
  fit?: "cover" | "contain";
  /** Optional non-clickable headline near the top of the banner (centered-cta variant), set in the
   * same typeface as the button but larger. */
  topText?: string;
  /** Homepage only (first section): pull the banner up underneath the sticky header, which is
   * transparent at the top of the page (see components/layout/header.tsx). Everything shown on the
   * banner keeps its on-screen position -- only the image now also fills the area behind the header. */
  overlayHeader?: boolean;
  /** Only the banner at the very top of the page: fetch its image first, ahead of everything else. */
  priority?: boolean;
} & ({ variant: "centered-cta" } | { variant: "split-bottom"; heading: string });

export function Hero(props: HeroProps) {
  const { desktopImage, mobileImage, buttonText, buttonHref, height = "720px", mobileHeight, mobileObjectPosition, fit = "cover", topText, overlayHeader = false, priority = false } = props;
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  // Caps the default mobile height to whatever the mobile image's own aspect ratio (585:1040, its
  // real uploaded size) can cover at the current viewport width without cropping its sides -- a
  // tall `height` like 100vh on a narrow phone otherwise forces object-cover to zoom in and crop
  // text baked into the image off both edges. On wider screens (desktop image/layout) this calc()
  // always exceeds the configured height, so min() just uses that height as before.
  const defaultHeight = `min(${height}, calc(100vw * 1040 / 585))`;
  const style = {
    "--hero-h": mobileHeight ? height : defaultHeight,
    "--hero-h-mobile": mobileHeight ?? defaultHeight,
  } as React.CSSProperties;

  // One <picture> instead of two <Image>s hidden/shown by CSS: the browser then downloads only the
  // version for the current screen (two priority <Image>s preloaded BOTH on every device).
  const common = { alt: "", fill: true, sizes: "100vw", priority, fetchPriority: priority ? "high" : undefined } as const;
  const desktop = getImageProps({ ...common, src: desktopImage }).props;
  const mobile = getImageProps({ ...common, src: mobileImage ?? desktopImage }).props;
  if (priority) {
    preload(mobile.src, { as: "image", imageSrcSet: mobile.srcSet, imageSizes: mobile.sizes, media: "(max-width: 767px)", fetchPriority: "high" });
    preload(desktop.src, { as: "image", imageSrcSet: desktop.srcSet, imageSizes: desktop.sizes, media: "(min-width: 768px)", fetchPriority: "high" });
  }

  return (
    <div className={`relative h-[var(--hero-h-mobile)] overflow-hidden md:h-[var(--hero-h)] ${fit === "contain" ? "bg-black" : ""} ${overlayHeader ? "-mt-[68px]" : ""}`}
      style={style}
      data-hero-overlay={overlayHeader ? "" : undefined}
    >
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes={desktop.sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture> built from getImageProps */}
        <img
          {...mobile}
          className={`${fitClass} [object-position:var(--hero-pos)] md:[object-position:50%_50%]`}
          style={{ ...mobile.style, "--hero-pos": mobileObjectPosition ?? "50% 50%" } as React.CSSProperties}
        />
      </picture>
      {/* No darkening overlay in "contain" mode -- the image is shown exactly as supplied. */}
      {fit !== "contain" && <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />}

      {props.variant === "centered-cta" && topText && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${overlayHeader ? "top-[108px] md:top-[124px]" : "top-10 md:top-14"}`}>
          <p
            className="whitespace-nowrap text-center font-serif text-[clamp(32px,10vw,64px)] font-bold uppercase leading-none tracking-wide text-white"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,.3)" }}
          >
            {topText}
          </p>
        </div>
      )}

      {props.variant === "centered-cta" ? (
        <div className="absolute inset-x-0 bottom-12 flex justify-center px-6">
          <Link
            href={buttonHref}
            className="font-serif text-2xl font-bold uppercase tracking-wide text-white"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,.3)" }}
          >
            {buttonText}
          </Link>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-10 flex items-end justify-between gap-6 px-6 lg:px-14">
          <p className="max-w-xs font-serif text-base text-[#dbd9d2]" style={{ whiteSpace: "pre-line" }}>
            {props.heading}
          </p>
          <Link href={buttonHref} className="text-sm font-semibold uppercase tracking-widest text-[#dbd9d2]">
            {buttonText}
          </Link>
        </div>
      )}
    </div>
  );
}
