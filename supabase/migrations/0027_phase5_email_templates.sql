-- Phase 5 of the admin-completion roadmap: a real, admin-editable email template system for the
-- 3 real transactional emails this project already sends (order confirmation, shipping
-- confirmation, refund notification -- see lib/email/templates.ts). Draft/live split, mirroring
-- the same pattern already proven for the homepage editor (storefront_layouts, Phase 7): editing
-- never affects a real customer email until an explicit "Publicera" action copies draft -> live.
-- The structured, data-driven parts of each email (order number, line items, totals, address,
-- tracking info) are never put in here as free text -- only the genuinely editable prose (subject
-- line, heading, intro paragraph, outro paragraph) is, so an edit can never corrupt a real order's
-- numbers.

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null check (key in ('order_confirmation', 'shipping_confirmation', 'refund_notification')),
  name text not null,

  subject text not null,
  heading text not null,
  intro_html text not null,
  outro_html text,

  draft_subject text not null,
  draft_heading text not null,
  draft_intro_html text not null,
  draft_outro_html text,

  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users (id) on delete set null,
  published_at timestamptz,
  published_by uuid references admin_users (id) on delete set null
);

alter table email_templates enable row level security;
create policy "admin only" on email_templates for all using (is_admin());
