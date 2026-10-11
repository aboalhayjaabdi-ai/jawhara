// Real theme (sections/marquee.liquid + assets/marquee.js): a continuous right-to-left CSS loop
// over content duplicated once, so the -50% translateX lands the clone exactly where the original
// started -- no visible jump. Honors prefers-reduced-motion via Tailwind's motion-safe variant
// (reduced-motion users get the static, non-animated version, matching real behavior).
//
// Each half of the track must render wider than any realistic viewport, or the loop shows a gap
// once the short content scrolls off before its clone catches up (visible on wide desktop
// viewports, not on narrow mobile ones). REPEAT keeps the same "·"-joined phrase pattern repeated
// enough times to guarantee that; the animation duration in tailwind.config.ts is scaled by the
// same factor so the per-phrase scroll speed is unchanged.
const REPEAT = 8;

export function Marquee({ items }: { items: string[] }) {
  const text = Array.from({ length: REPEAT }, () => items.join(" · ")).join(" · ");
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
