import { supabaseService } from "@/lib/supabase/service-client";
import type { AdminLocale, AdminRole } from "@/lib/admin/auth";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/staff.ts must never be imported into client code");
}

export type StaffRow = {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  locale: AdminLocale;
  disabled: boolean;
  invitedByEmail: string | null;
  lastSignInAt: string | null;
  createdAt: string;
};

/**
 * admin_users has no email/last-sign-in column (those live on auth.users) -- resolved the same
 * way lib/admin/audit-log.ts's buildActorEmailMap() does, via the Auth admin API, once per page
 * load. Fine at this account volume (a handful of real staff accounts, never hundreds).
 */
export async function listStaff(): Promise<StaffRow[]> {
  const [{ data: admins }, { data: authUsers }] = await Promise.all([
    supabaseService.from("admin_users").select("id, auth_user_id, role, locale, disabled, invited_by, created_at").order("created_at", { ascending: true }),
    supabaseService.auth.admin.listUsers(),
  ]);

  const authById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));
  const emailByAdminId = new Map((admins ?? []).map((a) => [a.id, authById.get(a.auth_user_id)?.email ?? "(okänd)"]));

  return (admins ?? []).map((a) => ({
    id: a.id,
    authUserId: a.auth_user_id,
    email: authById.get(a.auth_user_id)?.email ?? "(okänd)",
    role: a.role as AdminRole,
    locale: (a.locale as AdminLocale) ?? "sv",
    disabled: a.disabled,
    invitedByEmail: a.invited_by ? emailByAdminId.get(a.invited_by) ?? null : null,
    lastSignInAt: authById.get(a.auth_user_id)?.last_sign_in_at ?? null,
    createdAt: a.created_at,
  }));
}
