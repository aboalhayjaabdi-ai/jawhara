-- Real contact form on /pages/contact (migrated from the live theme's native
-- contact-form section: name, email, phone, message). No email/notification
-- service is wired up yet (Resend integration is later Phase 7 work) -- this
-- table is the functional, durable record of each submission in the meantime.

create table contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

-- Anyone can submit the public contact form; only admins can read submissions.
create policy "public insert" on contact_submissions for insert with check (true);
create policy "admin read" on contact_submissions for select using (is_admin());
