"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Deliberately NOT createAuthBrowserClient() here: that client (@supabase/ssr) is hardcoded to
// the PKCE flow and only ever looks for a "?code=" query param, but Supabase's password-recovery
// links use the classic implicit-flow "#access_token=...&type=recovery" hash fragment -- a plain
// supabase-js client (detectSessionInUrl: true by default) is what actually reads that. The
// resulting session lives in localStorage only, which is enough to call updateUser() once; the
// normal cookie-based admin session is then established the ordinary way when the user signs in
// again on /admin/login with their new password.
function createRecoveryClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

// Reached only via a Supabase-issued password-recovery link (carries its session as a URL hash
// fragment the server never sees -- middleware.ts explicitly exempts this path so the page can
// load before that exchange happens). Used both for the first-time password setup on a newly
// invited admin account and for an ordinary "forgot password" reset later.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createRecoveryClient());
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The recovery link's #access_token=...&type=recovery hash is exchanged for a real session
    // by the Supabase client as soon as it initializes client-side -- give it a moment, then
    // confirm a session actually exists before showing the form.
    supabase.auth.getSession().then(({ data }) => {
      setReady(!!data.session);
      if (!data.session) setError("Länken är ogiltig eller har gått ut. Begär en ny länk från en administratör.");
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== confirm) {
      setError("Lösenorden matchar inte.");
      return;
    }
    setStatus("submitting");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setStatus("error");
      setError(updateError.message);
      return;
    }
    setStatus("done");
    setTimeout(() => router.push("/admin/login"), 2000);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-8 text-center font-serif text-xl">Jawhara Admin</h1>
      {!ready && !error && <p className="text-center text-sm text-muted">Verifierar länk…</p>}

      {ready && status !== "done" && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">Välj ett nytt lösenord för ditt administratörskonto.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs uppercase tracking-wide text-muted">
              Nytt lösenord
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 border border-line px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-xs uppercase tracking-wide text-muted">
              Bekräfta lösenord
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 border border-line px-3 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="mt-2 flex h-12 w-full items-center justify-center bg-fg text-xs font-semibold uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {status === "submitting" ? "Sparar…" : "Spara lösenord"}
          </button>
        </form>
      )}

      {status === "done" && <p className="text-center text-sm text-emerald-700">Lösenordet är sparat. Skickar dig till inloggningen…</p>}
      {!ready && error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
