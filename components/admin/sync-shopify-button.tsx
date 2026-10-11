"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncShopifyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/orders/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Synkning misslyckades.");
      } else {
        setMessage(`${data.importedCount} av ${data.pulledCount} ordrar synkade.`);
        router.refresh();
      }
    } catch {
      setMessage("Synkning misslyckades.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={loading}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Synkar…" : "Synka från Shopify"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
