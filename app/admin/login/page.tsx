"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase/browser-auth";

export default function AdminLoginPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const data = new FormData(e.currentTarget);
    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.get("email") as string,
      password: data.get("password") as string,
    });

    if (error) {
      setStatus("error");
      setErrorMessage("Fel e-post eller lösenord.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-8 text-center font-serif text-xl">Jawhara Admin</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs uppercase tracking-wide text-muted">
            E-post
          </label>
          <input id="email" name="email" type="email" required autoComplete="username" className="h-11 border border-line px-3 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs uppercase tracking-wide text-muted">
            Lösenord
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-11 border border-line px-3 text-sm"
          />
        </div>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="mt-2 flex h-12 w-full items-center justify-center bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
        >
          {status === "submitting" ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </div>
  );
}
