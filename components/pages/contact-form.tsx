"use client";

import { useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("submitting");

    const { error } = await supabase.from("contact_submissions").insert({
      name: (data.get("name") as string) || null,
      email: data.get("email") as string,
      phone: (data.get("phone") as string) || null,
      body: data.get("body") as string,
    });

    if (error) {
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
      {status === "error" && (
        <p className="text-xs text-red-700">Något gick fel. Försök igen eller maila oss direkt.</p>
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
