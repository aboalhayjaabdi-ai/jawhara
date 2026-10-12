import { stripe } from "@/lib/stripe/server";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/payments-status.ts must never be imported into client code");
}

export type StripeConnectionStatus =
  | { ok: true; accountName: string | null; accountEmail: string | null; country: string | null; mode: "live" | "test"; defaultCurrency: string | null }
  | { ok: false; error: string };

/** Read-only -- the same balance.retrieve()/accounts.retrieve() proof-of-connection pattern
 * already used (and proven safe) in earlier phases. Never creates, modifies, or charges anything. */
export async function getStripeConnectionStatus(): Promise<StripeConnectionStatus> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "STRIPE_SECRET_KEY är inte konfigurerad." };

  try {
    const account = await stripe.accounts.retrieve();
    return {
      ok: true,
      accountName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
      accountEmail: account.email ?? null,
      country: account.country ?? null,
      mode: key.startsWith("sk_live_") ? "live" : "test",
      defaultCurrency: account.default_currency?.toUpperCase() ?? null,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Kunde inte ansluta till Stripe." };
  }
}
