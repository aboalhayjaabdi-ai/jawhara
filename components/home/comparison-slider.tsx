"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export function ComparisonSlider({
  beforeImage,
  afterImage,
  heading,
}: {
  beforeImage: string;
  afterImage: string;
  heading?: string;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMove(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }

  return (
    <section className="px-6 py-16 lg:px-14">
      <div className="mx-auto max-w-[900px]">
        {heading && <h2 className="mb-8 text-center text-2xl">{heading}</h2>}
        <div
          ref={containerRef}
          className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden"
          onMouseMove={(e) => e.buttons === 1 && handleMove(e.clientX)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        >
          <Image src={afterImage} alt="" fill className="object-cover" />
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
            <Image src={beforeImage} alt="" fill className="object-cover" />
          </div>
          <div className="absolute inset-y-0 w-0.5 bg-bg" style={{ left: `${position}%` }}>
            <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-bg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7 3 12l5 5M16 7l5 5-5 5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
