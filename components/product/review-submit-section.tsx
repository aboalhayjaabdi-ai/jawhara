"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ReviewSubmitSection({ productId }: { productId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("review_token");
  const [open, setOpen] = useState(Boolean(token));
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  // This section only exists in the DOM once this client component mounts (it needs the real
  // URL's ?review_token, so Next.js can't render it on the server for a static product page) --
  // by then the browser's one-time "jump to #skriv-recension on load" has already happened and
  // found nothing there, so it never scrolls. Do it ourselves once the form is actually present.
  useEffect(() => {
    if (token) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating < 1) {
      setErrorMessage("Välj ett betyg mellan 1 och 5 stjärnor.");
      setResult("error");
      return;
    }
    setSubmitting(true);
    setResult(null);
    setErrorMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.set("productId", productId);
    formData.set("rating", String(rating));
    if (token) formData.set("token", token);

    try {
      const res = await fetch("/api/reviews/submit", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage(data.error ?? "Något gick fel. Försök igen.");
        setResult("error");
      } else {
        setResult("ok");
        formRef.current?.reset();
        setRating(0);
      }
    } catch {
      setErrorMessage("Något gick fel. Kontrollera din internetanslutning och försök igen.");
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="skriv-recension" ref={sectionRef} className="mt-10 border-t border-line pt-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-12 border border-fg px-6 text-xs font-semibold uppercase tracking-widest hover:bg-fg hover:text-bg"
        >
          Skriv en recension
        </button>
      ) : result === "ok" ? (
        <div className="max-w-[480px] border border-line p-6 text-sm leading-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Tack!</div>
          <p className="mt-2">Din recension har skickats in och granskas innan den publiceras.</p>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="max-w-[480px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Skriv en recension</div>
          {token && (
            <p className="mt-2 text-xs text-muted">Du recenserar ett köp du gjort hos oss -- din recension märks som Verifierat köp.</p>
          )}

          <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Betyg">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={`${star} av 5 stjärnor`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1 text-2xl leading-none"
              >
                {(hoverRating || rating) >= star ? "★" : "☆"}
              </button>
            ))}
          </div>

          <input
            name="authorName"
            type="text"
            maxLength={100}
            placeholder="Ditt namn (valfritt)"
            className="mt-4 h-11 w-full border border-line px-3 text-sm placeholder:text-muted"
          />
          <textarea
            name="body"
            maxLength={5000}
            rows={4}
            placeholder="Berätta vad du tycker (valfritt)"
            className="mt-3 w-full border border-line px-3 py-2 text-sm placeholder:text-muted"
          />
          <label className="mt-3 block text-xs text-muted">
            Lägg till bilder (valfritt, max 4)
            <input name="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple className="mt-1.5 block w-full text-xs" />
          </label>

          {result === "error" && errorMessage && <p className="mt-3 text-xs text-red-600">{errorMessage}</p>}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="h-12 flex-1 bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-50"
            >
              {submitting ? "Skickar..." : "Skicka recension"}
            </button>
            {!token && (
              <button type="button" onClick={() => setOpen(false)} className="h-12 px-4 text-xs font-semibold uppercase tracking-widest text-muted">
                Avbryt
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
