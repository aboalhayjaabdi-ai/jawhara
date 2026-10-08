# Jawhara — independent e-commerce platform

Migration of the Jawhara Shopify store (jawhara.se) to a fully independent platform: Next.js +
TypeScript, Supabase (Postgres/Auth/Storage), Stripe + Klarna, Resend, deployed on Vercel.

See `/root/.claude/plans/you-are-a-senior-imperative-umbrella.md` for the full phase-by-phase
migration plan, `docs/migration-inventory.md` for the Phase 1 data audit, and
`docs/risk-register.md` for known risks and mitigations.

## Shopify connection (read-only)

`scripts/shopify/client.ts` mints a short-lived Admin API access token on demand via the OAuth
client-credentials grant (no static token stored). Requires `.env.local` (copy from
`.env.local.example`, gitignored, never committed):

```
SHOPIFY_STORE_DOMAIN=1tq41d-4y.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
```

Run the Phase 1 audit: `npm run audit` — writes a raw results dump to `data/exports/audit-raw.json`
(gitignored, contains store data pulled live).
