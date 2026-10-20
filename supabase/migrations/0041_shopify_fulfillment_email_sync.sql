-- Complete Shopify order/fulfillment/email integration:
--   1. Real two-way fulfillment sync (Jawhara admin <-> Shopify Admin GraphQL API), tracked by
--      the real Shopify fulfillment id so edits/retries/webhook echoes are idempotent.
--   2. Immutable per-order-item image/variant snapshots, so a transactional email (or a
--      historical order's admin view) never drifts from what the customer actually bought, even
--      if the product's media or variant is later changed/reassigned/deleted.
--   3. Idempotent delivery tracking for the emails Resend sends off a confirmed Shopify event
--      (order confirmation, shipping confirmation, cancellation), so a webhook retry -- Shopify
--      explicitly retries undelivered/erroring webhooks -- can never send the same email twice.
--   4. Raw webhook-delivery dedup (separate from the Stripe-only webhook_events table, which has
--      a NOT NULL stripe_event_id and isn't reusable here without touching that constraint).

-- ---------------------------------------------------------------------
-- Fulfillment <-> Shopify linkage
-- ---------------------------------------------------------------------

alter table fulfillments add column shopify_fulfillment_id text unique;
alter table fulfillments add column shopify_fulfillment_order_id text;
-- Set the moment Jawhara's own Resend shipping-confirmation email is actually sent for this
-- fulfillment -- the one idempotency check shared by the admin "Markera som skickad" action and
-- the fulfillments/update webhook, so whichever of them gets there first is the only one that
-- ever emails the customer for it.
alter table fulfillments add column notification_sent_at timestamptz;
-- Set when a Shopify API call failed for this fulfillment (e.g. an edit/retry that Shopify
-- rejected) -- surfaced in the admin UI instead of ever silently showing a fulfillment as
-- successfully synced when it wasn't.
alter table fulfillments add column shopify_sync_error text;

-- ---------------------------------------------------------------------
-- Immutable order-item snapshots -- resolved once (at order sync/webhook time) from the live
-- media table (lib/order-images.ts's existing logic), then frozen here. Emails and the admin
-- order page both prefer this snapshot and only fall back to a live lookup for rows synced
-- before this migration existed.
-- ---------------------------------------------------------------------

alter table order_items add column image_url text;
alter table order_items add column image_is_variant_specific boolean;
alter table order_items add column variant_title_snapshot text;

-- ---------------------------------------------------------------------
-- Order-level email idempotency (order confirmation / cancellation -- shipping's own is on
-- fulfillments above, refund's is on refunds below). Checked-and-set with a single
-- `update ... where confirmation_email_sent_at is null ... returning id` so the admin-action and
-- webhook paths for the same event can never both win the race and both send.
-- ---------------------------------------------------------------------

alter table orders add column confirmation_email_sent_at timestamptz;
alter table orders add column cancellation_email_sent_at timestamptz;
-- Set by the webhook path (orders/updated -> cancelledAt newly present) so a cancellation made
-- directly in Shopify is reflected here too, same as the existing admin cancelOrder() action sets
-- it directly.
alter table orders add column cancelled_by_shopify boolean not null default false;

alter table refunds add column notification_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- Raw Shopify webhook delivery dedup. Shopify's `X-Shopify-Webhook-Id` header is unique per
-- delivery attempt but IDENTICAL across Shopify's own retries of that same attempt, which is
-- exactly what's needed here: insert it first, and a unique-constraint conflict means "already
-- processed," so the handler can return 200 and stop instead of reprocessing.
-- ---------------------------------------------------------------------

create table shopify_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shopify_webhook_id text unique not null,
  topic text not null,
  processed_at timestamptz not null default now()
);

alter table shopify_webhook_events enable row level security;
create policy "admin only" on shopify_webhook_events for all using (is_admin());
