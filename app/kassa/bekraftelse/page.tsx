"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";

type Status = "loading" | "paid" | "pending" | "voided" | "error";

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

function Confirmation() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<Status>("loading");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const { items, removeItem } = useCart();
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch(`/api/checkout/session?session_id=${encodeURIComponent(sessionId!)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setOrderNumber(data.orderNumber);
        setTotal(data.total);
        if (data.status === "paid") {
          setStatus("paid");
          return;
        }
        if (data.status === "voided") {
          setStatus("voided");
          return;
        }
        if (attempts < 10) {
          setTimeout(poll, 1500);
        } else {
          setStatus("pending");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Clear the local cart once payment is confirmed server-side (webhook-driven), not on redirect alone.
  useEffect(() => {
    if (status === "paid" && !clearedRef.current) {
      clearedRef.current = true;
      items.forEach((i) => removeItem(i.variantId));
    }
  }, [status, items, removeItem]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      {status === "loading" && <p className="text-sm text-muted">Bekräftar din betalning…</p>}

      {status === "paid" && (
        <>
          <h1 className="font-serif text-2xl">Tack för din beställning!</h1>
          <p className="mt-4 text-sm text-muted">
            Ordernummer <strong>{orderNumber}</strong>
            {total != null && <> — {formatSek(total)}</>}
          </p>
          <p className="mt-2 text-sm text-muted">Vi har skickat en orderbekräftelse till din e-post.</p>
          <Link href="/" className="mt-8 inline-block text-xs font-semibold uppercase tracking-widest underline">
            Fortsätt handla
          </Link>
        </>
      )}

      {status === "pending" && (
        <p className="text-sm text-muted">
          Din betalning behandlas fortfarande. Ordernummer {orderNumber ?? "—"}. Ladda om sidan om en stund.
        </p>
      )}

      {status === "voided" && (
        <p className="text-sm text-muted">
          Tyvärr kunde en vara i din order inte levereras och betalningen har återbetalats automatiskt. Kontakta oss
          gärna på <a href="mailto:support@jawhara.se" className="underline">support@jawhara.se</a> om du har frågor.
        </p>
      )}

      {status === "error" && (
        <p className="text-sm text-muted">Kunde inte hitta din order. Kontakta oss på support@jawhara.se.</p>
      )}
    </div>
  );
}

export default function BekraftelsePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-6 py-24" />}>
      <Confirmation />
    </Suspense>
  );
}
