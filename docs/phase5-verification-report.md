# Phase 5 Verification Report — Stripe Commerce (2026-10-10)

Checkout remains **non-public** throughout this report (`NEXT_PUBLIC_CHECKOUT_ENABLED=false`,
confirmed absent from `.env.local` and only ever set transiently, in-process, for the specific
verification runs described below). **No real charge was ever initiated.** Nothing here touches
the Shopify store or connects jawhara.se to the new site.

## 1. Stripe connection — verified against your real, live account

A read-only script called `stripe.accounts.retrieve()` and `stripe.balance.retrieve()`:

- **Account:** JAWHARA, aboalhayja.aboodahya@gmail.com, country SE, mode **LIVE**
  (`sk_live_...`/`pk_live_...`, confirmed consistent with each other)
- **Charges enabled:** yes. **Payouts enabled:** yes.
- One thing worth a look on your side (not something I changed): the account's **default
  settlement currency is EUR**, while the store charges in SEK throughout. This doesn't block SEK
  charges — Stripe converts automatically — but confirm that's intentional for your payouts.

Two real blockers were found and fixed along the way, both in this container's outbound network
policy, not in your Stripe account:
- `api.stripe.com` (server-side API calls) — now allowlisted, confirmed via a real round-trip.
- `js.stripe.com` (the browser-side SDK needed to render the embedded Checkout UI) — **still
  pending** as of this report; see §8.

## 2. VAT — now a real, changeable setting

New `store_settings` table (migration `0006_store_settings.sql`), seeded `vat_rate_percent = 0`
— carrying forward your explicit 0% decision as the default, not re-deciding it (there remains no
reliable per-product tax rate anywhere in the real Shopify export to seed anything else from).
`lib/discounts.ts` now reads this value on every checkout computation instead of a hardcoded
literal. Changeable today via one SQL statement; a proper UI for it is Phase 6 admin-dashboard work.

## 3. Delivery details

- Migration `0007_order_shipping_address.sql`: `addresses.order_id` (nullable, cascades with the
  order) lets a guest checkout own a delivery address with no customer record required;
  `orders.shipping_address_id` points to it.
- `app/api/checkout/route.ts` now requests `shipping_address_collection: { allowed_countries:
  ['SE'] }` and `phone_number_collection: { enabled: true }` — **Sweden only**, per your decision,
  matching 100% of real historical order history.
- The webhook handler persists the collected address + phone against the order on confirmed
  payment. Verified end-to-end with a real signed synthetic event (see §5).

## 4. Discounts — freshness re-check, zero drift

A live, read-only Admin GraphQL query against the 6 real discounts confirmed **zero drift** since
the original extraction — every status/date/code matches exactly what's stored in Supabase:

| Title | Type | Status |
|---|---|---|
| 3 för 2 | Automatic BXGY | **ACTIVE** |
| Valfri Plånbok | Automatic BXGY | **ACTIVE** |
| RABATT20F | Code | **ACTIVE** |
| RABATT20 | Code | expired |
| 4ENNZ2AZJR5E | Code | expired |
| 6 för 4 | Automatic BXGY | expired |

Confirmed zero Pennywise-named or Pennywise-derived rows anywhere in the `discounts` table.

## 5. Non-charging payment/order verification — real Stripe API, zero real charges

**A real bug was found and fixed here:** the original design applied a discount as a single
*negative* Stripe line item. Stripe's API flatly rejects a negative `unit_amount` — this had never
been caught because earlier testing only exercised the webhook with hand-built synthetic events,
never an actual discount-bearing Checkout Session creation against the real API. Fixed by creating
an ad-hoc one-time Stripe Coupon (`amount_off`) for the computed discount total instead, and
confirmed the resulting Stripe-side amount matches our server-computed total exactly in every
scenario below.

Real (never-completed) Checkout Sessions created via the actual `/api/checkout` route:

| Scenario | Supabase-computed total | Stripe session amount | Match |
|---|---|---|---|
| Plain cart (1× Love armband, 289 kr) | 289 kr | 289 kr | ✅ |
| 3 för 2 qualifying (3× Love armband) | 578 kr (289 kr off) | 578 kr | ✅ |
| Valfri Plånbok qualifying (1 bag + 1 wallet) | 749 kr (249 kr off, cheapest item free) | 749 kr | ✅ |
| RABATT20F code applied | 231.20 kr (20% off) | 231.20 kr | ✅ |

No session was ever completed; each was either left to auto-expire or (the one real session
created during the pre-fix debugging run) explicitly expired via the API immediately after.

**Real data finding, not a bug:** testing "Valfri Plånbok" required temporarily bumping two
specific test variants' stock (restored to their exact original values immediately after, in the
same atomic script) because **all 16 real wallet variants in that promotion's "free item" pool are
currently at 0 or negative inventory** in the live-migrated catalog. The promotion itself is real
and active, but as things stand today, no customer could actually complete it — there's no stock
of the free item. Worth knowing before this goes live; restocking those wallet SKUs (or pausing
the promotion) is a decision for you, not something I changed.

Extended the hand-signed synthetic webhook suite (from the earlier session) with a case covering
the new shipping-address capture and discount-redemption recording — both verified correct against
the real database. Confirmed all **286 pre-existing Shopify-imported historical orders remain
untouched** (identified by `shopify_id`, distinct from the new `stripe_checkout_session_id` path);
two stray test-order rows from mid-debugging were found and cleaned up.

## 6. Resend

The API key is valid and connects successfully (confirmed via a real, failed-for-the-right-reason
request) — it's deliberately scoped to **sending only**, which is why I can't check your
`jawhara.se` sending-domain verification status programmatically. **Please confirm in your Resend
dashboard (Domains page)** whether `jawhara.se` shows as verified; if not, it'll give you the exact
DNS records to add.

Three Swedish templates (order confirmation — now with real line items, prices, and delivery
address; shipping confirmation; refund notification) were drafted and sent to you as files for
review. None of this is wired to actually send until you approve the copy — and it's moot anyway
while checkout stays flagged off.

## 7. Production webhook — documented, not deployed

`docs/stripe-webhook-vercel-runbook.md` has the exact Stripe Dashboard steps for registering the
production webhook once a real Vercel deployment exists. No Vercel project was created or touched.

## 8. Final testing — partially complete, one more allowlist needed

Playwright against the local dev server (never a public URL), checkout flag enabled only for the
test process:
- ✅ Add-to-cart → cart drawer → "Till kassan" (correctly enabled, not showing the disabled
  "Kassan öppnar snart" state) → navigation to `/kassa` — all confirmed working on desktop.
- ⏳ **Blocked:** rendering the actual embedded Stripe Checkout UI requires the *browser* (not
  just the server) to reach `js.stripe.com`, which this container's network policy still denies
  (confirmed via a real connection attempt, same category of fix as the two earlier ones). Add
  `js.stripe.com` under environment settings → Network access → Allowed domains, and I'll finish
  this check (both breakpoints, confirming correct displayed totals/discount/shipping field, never
  proceeding to card entry).
- Build-output secret-leak grep re-run clean after every change in this round — no `sk_live_`,
  `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, or `RESEND_API_KEY` value in any client bundle.

## What this does and does not prove

Every check above proves the integration's logic, math, and data wiring are correct against your
real Stripe account and real catalog data. **It does not prove a real customer can successfully
complete a live payment end-to-end** — that first real transaction should happen deliberately,
with you watching, only after you separately decide to flip `NEXT_PUBLIC_CHECKOUT_ENABLED` on.
Nothing in this report should be read as "production-verified" in that sense.

## Outstanding before Phase 5 is fully done

1. Allowlist `js.stripe.com` so the embedded Checkout UI can be visually verified.
2. Confirm `jawhara.se`'s sending-domain status in the Resend dashboard.
3. Review and approve (or request changes to) the three draft email templates.
4. Decide what to do about the currently-out-of-stock "Valfri Plånbok" wallet pool.
5. Your explicit, separate go-ahead before `NEXT_PUBLIC_CHECKOUT_ENABLED` is ever set to `true`.

## Next: Phase 6

Per the agreed plan, Phase 6 (the full no-code admin dashboard) gets its own dedicated planning
pass next, rather than being compressed into this commerce-focused plan.
