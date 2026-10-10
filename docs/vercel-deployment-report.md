# Private Vercel Deployment — Verification Report (2026-10-10)

## What exists now

- **Vercel project:** `am-207d/jawhara` (Hobby plan), linked via `.vercel/project.json` (gitignored).
- **Live URL:** `https://jawhara-silk.vercel.app` — not connected to any custom domain, not
  linked from jawhara.se or anywhere public.
- **Environment variables set on Vercel (production):** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_CHECKOUT_ENABLED=false`. Not pushed (unused by the deployed app, only by local
  migration scripts): `SHOPIFY_*`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`.
- **Real Stripe production webhook registered**, endpoint ID `we_1UP1bZEMrxa0kZmo96Bqotg1`,
  subscribed to `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`.
  (Went through one rotation during verification — see below — the ID above is the current, final
  one; the two earlier ones created during setup were deleted, not left behind.)
- **Supabase Auth** `SITE_URL` and redirect allow-list now point at the live URL, so the admin
  password-recovery flow has somewhere real to redirect to.

## Important correction: "Vercel Authentication" does not actually protect this deployment

Vercel auto-enabled its "Vercel Authentication" (SSO) deployment protection when the project was
created, and I initially reported this as a bonus privacy layer on top of the URL being unlisted.
**That was wrong, and I want to correct it plainly:** this Vercel account is on the **Hobby (free)
plan**, and deployment protection features are Pro-tier — confirmed via the account's own billing
API (`"plan": "hobby"`). In practice, a plain unauthenticated request to the live URL returns the
real page content directly, no login challenge at all (verified with a real `curl` request,
checking response headers and body, not just a status code). So the actual protection in place
is exactly what you originally approved: **the URL is unlisted and linked nowhere**, not
authentication-gated. Anyone who had the exact URL could reach it. If you want real access
control, the options are a Vercel Pro upgrade (makes deployment protection actually enforce), or a
simple app-level gate (e.g. HTTP Basic Auth in `middleware.ts`) I can add if you'd like it.

## Verification performed (real infrastructure, no mocking)

1. `curl` confirmed the live site, `/admin/login`, and `/sitemap.xml` all return real content (200).
2. `curl -X POST /api/checkout` on the live URL returned **403** — confirms checkout stays
   genuinely disabled on the actual deployment, not just locally.
3. **Full live webhook round-trip**, against real infrastructure end to end: created a real Stripe
   webhook endpoint, captured its signing secret in memory only (Vercel's "Secret"-type env vars
   are write-only by design — confirmed this the hard way, see below), pushed it to Vercel,
   redeployed, built a real `checkout.session.completed` payload for a real catalog variant, signed
   it with the real secret, and POSTed it directly to the live
   `jawhara-silk.vercel.app/api/webhooks/stripe` endpoint. Result: **200, order correctly marked
   paid, inventory correctly decremented 100→99**, then cleaned up and inventory restored to 100.
   This is the strongest possible proof short of a real Stripe-initiated delivery (which would
   require a real charge).
4. One real mid-verification correction: my first attempt tried to read `STRIPE_WEBHOOK_SECRET`
   back out of Vercel to build the test signature, which failed — Vercel's "Secret" type
   environment variables (the same type used for all values marked sensitive on this project) are
   deliberately **unretrievable once set**, matching Stripe's own behavior for its signing secrets.
   Fixed by rotating to a fresh webhook endpoint and secret, used immediately in-memory for the
   test, never persisted or printed anywhere — leaving the system in a fully verified, working
   state rather than a broken one.

## What this does not prove

Same as every previous report: this proves the logic, the wiring, and the real infrastructure
connections are all correct. It does not prove a real customer has ever completed a real payment —
that remains gated behind your separate, explicit decision to set
`NEXT_PUBLIC_CHECKOUT_ENABLED=true`, which is still `false` everywhere, confirmed live.
