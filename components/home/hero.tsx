import Image from "next/image";
import Link from "next/link";

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
} & ({ variant: "centered-cta" } | { variant: "split-bottom"; heading: string });

export function Hero(props: HeroProps) {
  const { desktopImage, mobileImage, buttonText, buttonHref, height = "720px", mobileHeight, mobileObjectPosition, fit = "cover", topText } = props;
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

  return (
    <div className={`relative h-[var(--hero-h-mobile)] overflow-hidden md:h-[var(--hero-h)] ${fit === "contain" ? "bg-black" : ""}`} style={style}>
      <Image
        src={mobileImage ?? desktopImage}
        alt=""
        fill
        priority
        sizes="100vw"
        className={`${fitClass} md:hidden`}
        style={mobileObjectPosition ? { objectPosition: mobileObjectPosition } : undefined}
      />
      <Image src={desktopImage} alt="" fill priority sizes="100vw" className={`hidden ${fitClass} md:block`} />
      {/* No darkening overlay in "contain" mode -- the image is shown exactly as supplied. */}
      {fit !== "contain" && <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />}

      {props.variant === "centered-cta" && topText && (
        <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center px-4 md:top-14">
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
