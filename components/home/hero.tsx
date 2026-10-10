import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  desktopImage: string;
  mobileImage?: string;
  buttonText: string;
  buttonHref: string;
  height?: string;
} & ({ variant: "centered-cta" } | { variant: "split-bottom"; heading: string });

export function Hero(props: HeroProps) {
  const { desktopImage, mobileImage, buttonText, buttonHref, height = "720px" } = props;
  return (
    <div className="relative overflow-hidden" style={{ height }}>
      <Image src={mobileImage ?? desktopImage} alt="" fill priority sizes="100vw" className="object-cover md:hidden" />
      <Image src={desktopImage} alt="" fill priority sizes="100vw" className="hidden object-cover md:block" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

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
