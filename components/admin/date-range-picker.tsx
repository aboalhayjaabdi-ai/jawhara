"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DashboardRange } from "@/lib/admin/analytics";

const DEFAULT_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "today", label: "Idag" },
  { value: "yesterday", label: "Igår" },
  { value: "7d", label: "Senaste 7 dagarna" },
  { value: "30d", label: "Senaste 30 dagarna" },
  { value: "month", label: "Denna månad" },
];

export function DateRangePicker({
  current,
  from,
  to,
  basePath = "/admin",
  options = DEFAULT_OPTIONS,
}: {
  current: DashboardRange;
  from?: string;
  to?: string;
  basePath?: string;
  options?: { value: DashboardRange; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(current === "custom");
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  function setRange(range: DashboardRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    params.delete("from");
    params.delete("to");
    router.push(`${basePath}?${params.toString()}`);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            setCustomOpen(false);
            setRange(opt.value);
          }}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            current === opt.value ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustomOpen((v) => !v)}
        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
          current === "custom" ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
        }`}
      >
        Anpassat intervall
      </button>
      {customOpen && (
        <div className="flex items-center gap-2 rounded-full bg-white px-2 py-1 ring-1 ring-inset ring-gray-200">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-full px-2 py-1 text-xs text-gray-700 outline-none"
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-full px-2 py-1 text-xs text-gray-700 outline-none"
          />
          <button type="button" onClick={applyCustom} className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
            Använd
          </button>
        </div>
      )}
    </div>
  );
}
