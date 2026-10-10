export function Marquee({ items }: { items: string[] }) {
  const text = items.join(" · ");
  return (
    <div className="flex h-10 items-center overflow-hidden border-b border-line">
      <div className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {text} &nbsp;&middot;&nbsp; {text}
      </div>
    </div>
  );
}
