"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Red "Erbjudandet slutar om 5d 19h 42m 10s" under the campaign price note. Rendered only in the
 * browser (no server/client time mismatch) and hidden once the end time has passed.
 */
export function SaleCountdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (now == null || now >= end) return null;
  const { d, h, m, s } = parts(end - now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#d93a32] tabular-nums" aria-live="off">
      Erbjudandet slutar om {d > 0 ? `${d}d ` : ""}
      {pad(h)}h {pad(m)}m {pad(s)}s
    </p>
  );
}
