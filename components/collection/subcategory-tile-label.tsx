"use client";

import { useLinkStatus } from "next/link";

// Rendered inside each subcategory tile's <Link>. Underlined when the tile is the collection being
// viewed, as soon as it's clicked (while the next page loads -- useLinkStatus reads the parent
// Link's pending state), and on hover for devices that can hover (group-hover from the Link).
export function SubcategoryTileLabel({ title, active }: { title: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const marked = active || pending;
  return (
    <span
      className={`text-center text-[11px] leading-tight underline-offset-4 lg:text-xs ${
        marked ? "underline" : "[@media(hover:hover)]:group-hover:underline"
      }`}
    >
      {title}
    </span>
  );
}
