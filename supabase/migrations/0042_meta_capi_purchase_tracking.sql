-- Server-side Meta Conversions API Purchase tracking, fired from the Shopify orders webhook
-- (app/api/webhooks/shopify/route.ts) when an order newly becomes paid. Claimed atomically
-- (`update ... where purchase_event_sent_at is null ... returning id`), on its own column
-- independent of confirmation_email_sent_at, so a Meta API failure can never block the customer
-- email and vice versa, and a webhook retry can never report the same purchase to Meta twice.
alter table orders add column if not exists purchase_event_sent_at timestamptz;
