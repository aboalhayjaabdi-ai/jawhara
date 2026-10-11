import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/auth.ts must never be imported into client code");
}

export type AdminSession = {
  userId: string;
  adminId: string;
  email: string | null;
};

/**
 * Re-verifies the caller is a real admin, server-side -- call this first in every admin Server
 * Action / route handler that writes anything. This is the mutation-time guard, distinct from the
 * page-load check in app/admin/(authenticated)/layout.tsx: a hidden button is never the only thing
 * standing between a request and a write. Redirects to login with no session (mirrors the layout);
 * throws with a session but no admin_users row, since a Server Action can't redirect mid-mutation
 * the way a page load can -- callers should let this throw propagate as a hard failure.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: adminRow } = await supabase.from("admin_users").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!adminRow) throw new Error("Not authorized: no admin_users row for this account.");

  return { userId: user.id, adminId: adminRow.id, email: user.email ?? null };
}

/**
 * Writes one row to the audit_log table (defined since the original schema, never previously
 * written to). Call from every mutating admin action after requireAdmin() succeeds. Uses the
 * service-role client -- consistent with every other admin write in this project -- and never
 * throws into the caller: a logging failure must not block or roll back the action it's logging.
 */
export async function logAdminAction(
  actorId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabaseService.from("audit_log").insert({
      actor_id: actorId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      detail: detail ?? null,
    });
    if (error) console.error("logAdminAction insert failed", error);
  } catch (err) {
    console.error("logAdminAction failed", err);
  }
}
