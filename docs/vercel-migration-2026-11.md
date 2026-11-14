# Vercel account move (2026-11-14)

The old Vercel account (team `abood-6e12`, project `prj_T2A3zEEiGQG0lR6zZk7M0nrjqbQp`) was disabled
by Vercel (`402 DEPLOYMENT_DISABLED`), which took jawhara.se down. The site now runs on a new
account.

## New project

- Team `abood-new1` (`team_yJvwf03QVlwwy1KCRJMr2Hh3`), project `jawhara`
  (`prj_vj8uZSmkPWeMEhWmwPmtbryg3vLM`), Hobby plan.
- Git: `aboalhayjaabdi-ai/jawhara`, production branch `main`, automatic deployments on push.
- Framework Next.js, Node 24.x, functions in `dub1` (from `vercel.json`), daily cron
  `/api/cron/sync-orders` at 03:00 UTC (from `vercel.json`).
- Deployment protection: previews only (same as the old project). Custom domains are public.
- Domains: `www.jawhara.se` (primary), `jawhara.se` → 308 → `www.jawhara.se`.
- DNS for jawhara.se is Vercel DNS and was moved with the domain to the new team: all 21 records
  (Google Workspace MX/SPF/DKIM, Resend, Shopify mail, DMARC, CAA) plus two `_vercel` TXT records
  for the new project's domain verification. Certificates moved too and auto-renew.

## Environment variables (Production only, as on the old project)

Same 19 keys as the old project. Values that Vercel lets nobody read back ("sensitive") came from
the same credentials the scripts in this repo use, and were checked against the live services:

- Shopify, both stores: Admin token minted, webhook HMAC accepted, cart created in the new store.
- Supabase: order sync writes `cron_sync_runs`.
- Non-secret values were read from the old project: `NEXT_PUBLIC_SITE_URL=https://jawhara.se`,
  `NEXT_PUBLIC_CHECKOUT_ENABLED=true`, `SHOPIFY_ACTIVE_STORE=new`.
- The three cron secrets could not be read back, so they are new values:
  - `CRON_SECRET`: Vercel sends it to its own cron automatically.
  - `SUPABASE_CRON_SECRET`: also stored in Supabase Vault as `shopify_cron_secret`, which the
    pg_cron job `shopify-order-sync-5min` reads. Updated there, and runs succeed again.
  - `EXTERNAL_CRON_SECRET`: must match the GitHub Actions repository secret of the same name used by
    `.github/workflows/sync-orders-recovery.yml` (manual fallback).

## Nothing points at the old account any more

Shopify webhooks (7 per store) target `https://www.jawhara.se/api/webhooks/shopify`, which is
unchanged. The domain, DNS and certificates are on the new team. The old project still exists
without domains. It can be deleted.
