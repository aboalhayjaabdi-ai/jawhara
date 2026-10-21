"use client";

import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          body: data.get("body"),
          website: data.get("website"),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErrorMessage(json?.error ?? null);
        setStatus("error");
        return;
      }
    } catch {
      setStatus("error");
      return;
    }

    setStatus("done");
    form.reset();
  }

  if (status === "done") {
    return (
      <p className="text-sm leading-6">
        Tack för att du kontaktar oss. Vi återkommer till dig så snart som möjligt.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-xs uppercase tracking-wide text-muted">
          Namn
        </label>
        <input id="name" name="name" type="text" className="h-11 border border-line px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs uppercase tracking-wide text-muted">
          E-post *
        </label>
        <input id="email" name="email" type="email" required className="h-11 border border-line px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-xs uppercase tracking-wide text-muted">
          Telefon
        </label>
        <input id="phone" name="phone" type="tel" className="h-11 border border-line px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-xs uppercase tracking-wide text-muted">
          Kommentar *
        </label>
        <textarea id="body" name="body" required rows={5} className="border border-line p-3 text-sm" />
      </div>
      {/* Honeypot for spam bots: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Webbplats</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {status === "error" && (
        <p className="text-xs text-red-700">
          {errorMessage ?? "Något gick fel."} Försök igen eller maila oss direkt på support@jawhara.se.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-2 flex h-12 items-center justify-center bg-fg px-8 text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-50"
      >
        {status === "submitting" ? "Skickar..." : "Skicka"}
      </button>
    </form>
  );
}
