import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/audit-log.ts must never be imported into client code");
}

export type AuditLogFilters = {
  q?: string;
  entityType?: string;
  from?: string;
  to?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;
function one(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

export function parseAuditLogFilters(sp: SearchParams): AuditLogFilters {
  return { q: one(sp.q), entityType: one(sp.entityType), from: one(sp.from), to: one(sp.to) };
}

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

/**
 * admin_users has no email column (it lives on auth.users) -- resolved here via the admin API,
 * once per page load, for the handful of real admins this project will ever have.
 */
async function buildActorEmailMap(): Promise<Map<string, string>> {
  const [{ data: admins }, { data: authUsers }] = await Promise.all([
    supabaseService.from("admin_users").select("id, auth_user_id"),
    supabaseService.auth.admin.listUsers(),
  ]);
  const emailByAuthId = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? "(okänd)"]));
  return new Map((admins ?? []).map((a) => [a.id, emailByAuthId.get(a.auth_user_id) ?? "(okänd)"]));
}

export async function listAuditLog(filters: AuditLogFilters, page: number): Promise<{ rows: AuditLogRow[]; total: number }> {
  const supabase = await createAuthServerClient();
  let query = supabase.from("audit_log").select("id, actor_id, action, entity_type, entity_id, detail, created_at", { count: "exact" });

  if (filters.q) query = query.ilike("action", `%${filters.q}%`);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lt("created_at", filters.to);

  query = query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data, count }, actorEmailById] = await Promise.all([query, buildActorEmailMap()]);

  const rows: AuditLogRow[] = (data ?? []).map((r) => ({
    id: r.id,
    actorEmail: r.actor_id ? (actorEmailById.get(r.actor_id) ?? null) : null,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    detail: r.detail as Record<string, unknown> | null,
    createdAt: r.created_at,
  }));

  return { rows, total: count ?? 0 };
}

export { PAGE_SIZE as AUDIT_LOG_PAGE_SIZE };
