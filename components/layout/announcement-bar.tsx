"use client";

import { useEffect, useState } from "react";
import { ANNOUNCEMENTS } from "@/lib/campaign";

// Messages come from lib/campaign.ts (Black Month copy while the campaign is active, the previous
// rotating lines otherwise).
const INTERVAL_MS = 4500;

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || ANNOUNCEMENTS.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ANNOUNCEMENTS.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      className="bg-fg text-bg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Every message sits in the same grid cell, so the bar's size never depends on which one is
          showing -- swapping text can't shift the layout. Only opacity changes (a soft crossfade);
          reduced-motion users get an instant swap instead of a fade. */}
      <div className="mx-auto grid h-9 max-w-[1440px] items-center px-4">
        {ANNOUNCEMENTS.map((message, i) => (
          <p
            key={message}
            aria-hidden={i !== index}
            className={`col-start-1 row-start-1 truncate text-center text-[10px] font-medium uppercase tracking-[0.08em] motion-safe:transition-opacity motion-safe:duration-700 motion-safe:ease-in-out sm:text-[11px] sm:tracking-wide ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          >
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}
