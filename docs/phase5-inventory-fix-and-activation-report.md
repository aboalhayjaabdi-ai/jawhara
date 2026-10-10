# Phase 5: Inventory Fix, Email Activation & Checkout Activation Status (2026-10-10)

This covers the work done in response to your inventory-tracking correction, your approval of the
3 email templates, and your authorization to activate checkout. Full detail on the inventory fix
itself is in `docs/inventory-tracking-audit.md`; this report summarizes everything and gives the
final go/no-go on checkout activation.

## 1. Email templates — approved and now genuinely live

All three Swedish templates are wired to send automatically, only from real, webhook-verified
events:
- **Order confirmation** — sends once per confirmed payment (`checkout.session.completed`).
- **Refund notification** — sends once per real refund (`charge.refunded`).
- **Shipping confirmation** — the template is built and ready, but has no trigger yet because there
  is no "mark as shipped" action anywhere in the app yet — that's genuinely Phase 6 admin-dashboard
  work (fulfillment management). Nothing to activate here until that exists.

**Duplicate protection** is structural, not a best-effort check: the webhook's own idempotency
(`webhook_events`, keyed on the Stripe event ID) rejects a replayed delivery *before* any handler
code — including the email-send call — ever runs. A genuine duplicate delivery of the same event
cannot send a second email. This was proven directly in last session's test suite (a replayed event
returns `{deduped: true}` without reprocessing) and the dedup logic is unchanged.

**Verified with a real send**, not just code review: a real webhook event was processed end-to-end
and successfully sent a real order-confirmation email via Resend to `support@jawhara.se` (the
business's own verified address, not a customer) — proving the full pipeline (webhook → order
lookup → line items → address → template → Resend API) actually works, not just that it doesn't
throw. Worth a glance in that inbox to confirm formatting looks right to you.

## 2. Inventory tracking — root cause found and fixed catalog-wide

**You were right, and it wasn't just the wallets.** Full detail in
`docs/inventory-tracking-audit.md`; summary:

- **Root cause:** Shopify's `inventoryItem.tracked` flag was captured in the original extraction
  but never made it into the Supabase schema — no column existed for it. `inventory_policy` *was*
  imported but was never actually read anywhere. Every availability check (product page, checkout,
  webhook) used only the raw stock number.
- **203 of 788 variants** have tracking disabled in Shopify (re-confirmed live, not just trusted
  from the old export). **201 of those** had a recorded quantity ≤ 0 and were being **incorrectly
  shown as sold out** — spanning **95 product listings across 12 distinct products**: not just the
  4 wallet names, but also "H armband smal" (82 variants alone) and "H sminkväska."
- Fixed with a single shared `isVariantAvailable()` function used identically everywhere a
  purchase decision is made (product page, server-side checkout validation, Stripe session
  creation, webhook inventory decrement) — untracked ⇒ always purchasable regardless of quantity;
  tracked ⇒ respects quantity and the continue-selling policy; non-active products ⇒ never
  purchasable.
- The webhook now **never decrements an untracked variant's inventory at all** — verified with a
  real test: a real purchase of an untracked, −7-quantity wallet left that exact −7 untouched,
  bit-for-bit, after payment.
- **No quantity was invented.** Every untracked variant's recorded number (including the negative
  ones) is left exactly as it was — it's just no longer used to block a sale.
- **Zero active products are now incorrectly unavailable.** Exactly one active product (*LV
  armband*) is still genuinely sold out — tracked, zero stock, by Shopify's own real rules — and
  correctly stays that way.
- Draft/archived products (51 + 2 of 376) are confirmed still non-purchasable regardless of
  tracking status, verified with a real test.

## 3. Valfri Plånbok — restored, with real, untouched data

Re-tested end-to-end using the real catalog data exactly as it sits today (Joélle väska at 0,
YSL Plånbok at −7, neither artificially adjusted): a bag + a wallet in cart correctly triggers the
promotion, the cheapest eligible wallet is awarded free (100% off, 249 kr), the computed total
matches a real Stripe Checkout Session exactly, and the real stock values were confirmed completely
unchanged by the check. No Pennywise logic is involved anywhere in this path — re-confirmed, same
as last report.

## 4. Checkout activation — 7 of 8 checks pass; one real, structural blocker

Full checklist in my previous message. The one unmet item: **there is no production deployment
anywhere**, so there is no URL for Stripe to deliver a production webhook to —
`STRIPE_WEBHOOK_SECRET` is confirmed absent from every real location in this container. Per your
own instruction ("if any critical requirement is not met, do not enable checkout"),
`NEXT_PUBLIC_CHECKOUT_ENABLED` has **not** been set to `true`.

You chose to resolve this by deploying to a private Vercel URL (never connected to jawhara.se,
never linked anywhere public) so a real webhook can be registered and checkout genuinely activated
and verified end-to-end. I can't do that myself yet: there's no Vercel integration available in
this environment, and deploying needs real credentials I don't have. **I need a Vercel API token**
added as an environment secret (`VERCEL_TOKEN`, same never-pasted-in-chat pattern as your Stripe
and Resend keys) — instructions given separately. Once that's there, I'll deploy, register the
webhook, and finish activation.

## What's genuinely done vs. still pending

**Done, verified with real data/real API calls, pushed to `claude/festive-pasteur-77mezq`:**
inventory-tracking fix (catalog-wide), Valfri Plånbok restoration, email activation with proven
duplicate protection, and a definitive 7/8 pre-activation checklist.

**Still pending, blocking only the final activation step:** a Vercel token from you, so a real
deployment and production webhook can exist for checkout to actually be activated against.

**Unchanged, still true:** nothing in your Shopify store has been touched; jawhara.se is not
connected to any of this; no real payment has ever been initiated; the eventual Vercel URL will not
be linked from jawhara.se or discoverable anywhere.

## Next: Phase 6

Starting the Phase 6 (admin dashboard) planning pass now, in parallel with waiting on the Vercel
token — that work doesn't depend on deployment.
