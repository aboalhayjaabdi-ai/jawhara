-- Phase 6: product review management. Adds moderation, merchant-reply, and manual-entry support
-- on top of the existing imported-Judge.me `reviews` table, without touching any already-imported
-- row's rating/author/body/verified_buyer/created_at data.

alter table reviews
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column source text not null default 'judgeme' check (source in ('judgeme', 'manual')),
  add column customer_email text,
  add column moderated_at timestamptz,
  add column moderated_by uuid references admin_users (id) on delete set null,
  add column merchant_reply_body text,
  add column merchant_reply_at timestamptz,
  add column merchant_reply_by uuid references admin_users (id) on delete set null,
  add column updated_at timestamptz not null default now();

create index reviews_status_idx on reviews (status);

-- Shoppers only ever see approved reviews; admins (reading through the auth-bound client, which
-- is what the admin list/detail pages use) still see every status via is_admin(). Mirrors the
-- existing `products`/`discounts` "public read" pattern exactly.
drop policy "public read" on reviews;
create policy "public read" on reviews for select using (status = 'approved' or is_admin());

-- Defense-in-depth parity with every other admin-managed table; actual admin writes go through
-- the service-role client, same convention as every prior phase.
create policy "admin write" on reviews for all using (is_admin());
