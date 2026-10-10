# Registering the production Stripe webhook (Phase 9 launch step)

This is a documented runbook only — nothing here is executed until the site is actually deployed
to Vercel, which has not happened yet. No Vercel project exists or is connected to this repo as of
this writing. Do this once, after the real deployment domain is known.

## 1. Deploy the Next.js app to Vercel

Standard Vercel deployment for this repo. All environment variables currently in `.env.local`
(and the ones already present in this cloud container as process env vars — `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`) need to be added to the Vercel project's
own Environment Variables settings. `STRIPE_WEBHOOK_SECRET` is added in step 3 below, after the
endpoint is registered — not before, since it doesn't exist yet at this point.

Keep `NEXT_PUBLIC_CHECKOUT_ENABLED=false` on the Vercel deployment too, until a separate, explicit
decision to go live.

## 2. Register the webhook endpoint in the Stripe Dashboard

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. Endpoint URL: `https://<your-vercel-domain>/api/webhooks/stripe`
3. Select **Listen to events on your account** (not Connect).
4. Select these events only (matches exactly what `app/api/webhooks/stripe/route.ts` handles —
   adding others does no harm since unhandled event types are a no-op, but these are the ones that
   matter):
   - `checkout.session.completed`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Create the endpoint.

## 3. Get the signing secret and add it to Vercel

The Dashboard shows a **Signing secret** (`whsec_...`) for the endpoint you just created. Add it
to the Vercel project's Environment Variables as `STRIPE_WEBHOOK_SECRET`. Redeploy (or let Vercel's
own env-var-change redeploy happen) so the running app picks it up.

## 4. Verify before relying on it

Stripe Dashboard → the webhook endpoint → **Send test webhook** → pick `checkout.session.completed`
→ send it, and confirm it shows as succeeded (200) in the endpoint's event log. This exercises
signature verification against the real `STRIPE_WEBHOOK_SECRET` end-to-end without needing a real
order or payment.

## Local development note (already in place, no action needed)

For local testing during development, the Stripe CLI's `stripe listen --forward-to
localhost:3000/api/webhooks/stripe` approach gives a temporary signing secret without needing a
public URL at all — this is how the webhook handler's logic was verified in this container
(against hand-signed synthetic events, since this container also has no public inbound URL). That
local secret is unrelated to the production one above and is never the same value.
