-- Automatic post-shipment review-request emails, plus real customer-facing review submission
-- (previously the `reviews` table was populated only by the Judge.me import and manual admin
-- entry -- this adds the real storefront write path on top, without touching any existing row).

-- One row per order, created the moment an order is first marked fully shipped (never for
-- historical orders, since nothing backfills this table -- only the fulfillment actions insert
-- into it going forward). `order_id` is unique so re-marking/editing a shipment can never reset
-- the 14-day countdown (insert is a no-op on conflict).
create table review_request_schedule (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders (id) on delete cascade,
  shipped_at timestamptz not null,
  send_after timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'skipped', 'failed')),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
-- The cron job's only query: due, not-yet-sent rows.
create index review_request_schedule_due_idx on review_request_schedule (send_after) where status = 'scheduled';

-- Same rate-limit-ledger shape as tracking_lookup_attempts (migration 0034) -- caps review
-- submissions per IP per time window regardless of whether a token was used.
create table review_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  attempted_at timestamptz not null default now()
);
create index review_submission_attempts_ip_time_idx on review_submission_attempts (ip_address, attempted_at desc);

alter table review_request_schedule enable row level security;
alter table review_submission_attempts enable row level security;
create policy "admin only" on review_request_schedule for all using (is_admin());
create policy "admin only" on review_submission_attempts for all using (is_admin());

-- Real customer-submitted reviews now need to record which order verified them (for the
-- "Verifierat köp" badge, and to let a signed email link map back to a genuine purchase) and
-- optionally carry customer-uploaded photos. Every existing row keeps order_id null/photo_urls
-- empty -- no existing rating/author/body/verified_buyer/created_at is touched.
alter table reviews
  add column order_id uuid references orders (id) on delete set null,
  add column photo_urls jsonb not null default '[]'::jsonb;

-- A genuine purchase can only ever back one review per product (prevents a leaked/reused signed
-- link from posting the same order+product review twice); reviews without an order_id (imports,
-- manual admin entries, and direct un-verified storefront submissions) are unaffected.
create unique index reviews_order_product_uidx on reviews (order_id, product_id) where order_id is not null;

alter table reviews drop constraint reviews_source_check;
alter table reviews add constraint reviews_source_check check (source in ('judgeme', 'manual', 'storefront'));

-- Admin on/off switch for sending (the cron job always checks this; defaults to off so deploying
-- this feature can never start emailing real customers on its own).
insert into store_settings (key, value) values ('review_request_emails_enabled', 'false');

alter table email_templates drop constraint email_templates_key_check;
alter table email_templates add constraint email_templates_key_check
  check (key in ('order_confirmation', 'shipping_confirmation', 'refund_notification', 'order_cancellation', 'review_request'));

insert into email_templates (key, name, subject, heading, intro_html, outro_html, draft_subject, draft_heading, draft_intro_html, draft_outro_html, published_at)
values (
  'review_request',
  'Recensionsförfrågan',
  'Vad tycker du om ditt köp hos Jawhara?',
  'Hur var din upplevelse?',
  '<p style="font-size: 14px;">Vi hoppas att du älskar dina nya varor! Det tar bara en minut att dela vad du tycker -- det hjälper andra kunder och oss otroligt mycket.</p>',
  '<p style="font-size: 14px;">Tack för att du handlar hos oss!</p>',
  'Vad tycker du om ditt köp hos Jawhara?',
  'Hur var din upplevelse?',
  '<p style="font-size: 14px;">Vi hoppas att du älskar dina nya varor! Det tar bara en minut att dela vad du tycker -- det hjälper andra kunder och oss otroligt mycket.</p>',
  '<p style="font-size: 14px;">Tack för att du handlar hos oss!</p>',
  now()
);
