import { cache } from "react";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/auth.ts must never be imported into client code");
}

export type AdminRole = "admin" | "staff" | "fulfillment_staff";
export type AdminLocale = "sv" | "zh";

export type AdminSession = {
  userId: string;
  adminId: string;
  email: string | null;
  role: AdminRole;
  locale: AdminLocale;
};

type RawAdminLookup = {
  user: { id: string; email: string | null } | null;
  adminRow: { id: string; role: string; disabled: boolean; locale: string | null } | null;
};

/**
 * The actual getUser() network round-trip + admin_users query, wrapped in React's per-request
 * `cache()` so every caller within the SAME render pass (app/admin/(authenticated)/layout.tsx and
 * a page.tsx that also calls requireAdmin() directly, e.g. orders/products/dashboard) shares one
 * result instead of each re-running it. This is pure deduplication of an identical question asked
 * twice for the identical request -- not a weaker check: a Server Action is a separate request
 * (new render pass, so a fresh cache + a fresh real check), and middleware's own getUser() call
 * runs in a different execution phase entirely (outside React's render, so outside this cache) and
 * still independently re-verifies on every request, before any rendering happens at all. Layout
 * and a page both calling requireAdmin() was previously 2 full network round-trips to Supabase
 * Auth plus 2 admin_users queries for a single page load, on top of middleware's own -- this cuts
 * that render-time half back to 1.
 */
const lookupAdminSession = cache(async (): Promise<RawAdminLookup> => {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, adminRow: null };

  const { data: adminRow } = await supabase.from("admin_users").select("id, role, disabled, locale").eq("auth_user_id", user.id).maybeSingle();
  return { user: { id: user.id, email: user.email ?? null }, adminRow };
});

/**
 * Re-verifies the caller is a real admin, server-side -- call this first in every admin Server
 * Action / route handler that writes anything. This is the mutation-time guard, distinct from the
 * page-load check in app/admin/(authenticated)/layout.tsx: a hidden button is never the only thing
 * standing between a request and a write. Redirects to login with no session (mirrors the layout);
 * throws with a session but no admin_users row, since a Server Action can't redirect mid-mutation
 * the way a page load can -- callers should let this throw propagate as a hard failure.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const { user, adminRow } = await lookupAdminSession();
  if (!user) redirect("/admin/login");
  if (!adminRow || adminRow.disabled) throw new Error("Not authorized: no active admin_users row for this account.");

  return {
    userId: user.id,
    adminId: adminRow.id,
    email: user.email,
    role: adminRow.role as AdminRole,
    locale: (adminRow.locale as AdminLocale) ?? "sv",
  };
}

/**
 * Same cached lookup as requireAdmin(), for app/admin/(authenticated)/layout.tsx -- which has
 * different fallback behavior (defaults to role="admin"/"sv" when there's no user at all, since
 * middleware already guarantees an authenticated active admin reached this layout; only redirects
 * when a session exists but its admin_users row is missing/disabled). Never call this from a
 * Server Action: it has no redirect for the "no user" case, so a mutation could proceed without an
 * identified actor. Use requireAdmin() there instead.
 */
export async function getAdminSessionForLayout(): Promise<RawAdminLookup> {
  return lookupAdminSession();
}

/**
 * Gates the handful of customer actions sensitive enough to restrict beyond "any admin_users row"
 * (hard delete, anonymize, GDPR data export, bulk export) to role='admin'. There is still no
 * staff-invitation UI anywhere in this project -- every existing admin_users row is already
 * role='admin' -- so this has no visible effect today; it's the structural enforcement point the
 * project's own roadmap called for ("design every new check to key off that column, so adding real
 * roles later is a data change, not an architecture change"), exercised the moment a 'staff' row
 * is ever created (still a direct database edit, same as creating any admin_users row today).
 */
export function requireRole(admin: AdminSession, role: AdminRole): { ok: true } | { ok: false; error: string } {
  if (admin.role !== role) return { ok: false, error: `Endast rollen "${role}" kan göra detta.` };
  return { ok: true };
}

/**
 * Blocks the restricted "fulfillment_staff" role (view orders/products, update fulfillment
 * status + tracking only -- see lib/admin/permissions.ts) from every other mutation: price/
 * inventory/content edits, product delete/duplicate, refunds, cancellations, returns, order
 * notes/tags, hide/restore. Call this as the first line after requireAdmin() in any such action
 * and return its result if non-null. 'admin' and 'staff' are unaffected -- this role is the only
 * one with narrower-than-"any admin_users row" capabilities today.
 */
export function requireFullAdmin(admin: AdminSession): { ok: false; error: string } | null {
  if (admin.role === "fulfillment_staff") {
    return { ok: false, error: "Den här åtgärden är inte tillåten för den här rollen." };
  }
  return null;
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
