"use client";

import { useEffect, useState } from "react";

// Real theme: sections/header-group.json's header_announcements section, 4 real rotating lines,
// shown above the header on every page. Real "speed" setting is 2 (seconds per message).
const MESSAGES = ["3 FÖR 2 PÅ ALLA SMYCKEN!", "KÖP EN VÄSKA - FÅ EN PLÅNBOK", "FRI FRAKT!", "60 DAGARS GARANTI!"];

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-9 items-center justify-center bg-fg px-4 text-center text-[11px] font-medium uppercase tracking-wide text-bg">
      {MESSAGES[index]}
    </div>
  );
}
