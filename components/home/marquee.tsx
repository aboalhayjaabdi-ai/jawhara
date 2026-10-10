// Real theme (sections/marquee.liquid + assets/marquee.js): a continuous right-to-left CSS loop
// over content duplicated once, so the -50% translateX lands the clone exactly where the original
// started -- no visible jump. Honors prefers-reduced-motion via Tailwind's motion-safe variant
// (reduced-motion users get the static, non-animated version, matching real behavior).
export function Marquee({ items }: { items: string[] }) {
  const text = items.join(" · ");
  return (
    <div className="flex h-10 items-center overflow-hidden border-b border-line">
      <div className="flex w-max motion-safe:animate-marquee">
        <span className="shrink-0 whitespace-nowrap pr-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {text}
        </span>
        <span aria-hidden="true" className="shrink-0 whitespace-nowrap pr-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {text}
        </span>
      </div>
    </div>
  );
}
