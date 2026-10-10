"use client";

import { useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client";

// Real footer block (sections/footer-group.json): heading "Prenumerera på vårt nyhetsbrev",
// native email-signup block. Its own configured button label is literally "Sign up" (English,
// not translated) -- a real content quirk in the original theme, preserved as-is.
export function NewsletterSignup() {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email") as string;
    setStatus("submitting");

    const { error } = await supabase.from("newsletter_subscribers").insert({ email });
    if (error && !error.message.includes("duplicate")) {
      setStatus("error");
      return;
    }
    setStatus("done");
    form.reset();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Prenumerera på vårt nyhetsbrev</div>
      {status === "done" ? (
        <p className="text-sm">Tack för din prenumeration!</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex max-w-xs items-center gap-2 border-b border-fg pb-1.5">
          <input
            type="email"
            name="email"
            required
            placeholder="E-post"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button type="submit" disabled={status === "submitting"} className="text-xs font-semibold uppercase tracking-wide disabled:opacity-50">
            Sign up
          </button>
        </form>
      )}
      {status === "error" && <p className="text-xs text-red-700">Något gick fel. Försök igen.</p>}
    </div>
  );
}
