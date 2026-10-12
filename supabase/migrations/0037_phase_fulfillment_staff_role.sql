-- Adds a restricted "fulfillment_staff" role (orders + products view only, no financial/customer
-- data, no destructive actions) and a per-admin UI language preference, used to show a Simplified
-- Chinese interface for that role without affecting the owner's own Swedish admin experience.

alter table admin_users drop constraint admin_users_role_check;
alter table admin_users add constraint admin_users_role_check check (role in ('admin', 'staff', 'fulfillment_staff'));

alter table admin_users add column locale text not null default 'sv' check (locale in ('sv', 'zh'));
