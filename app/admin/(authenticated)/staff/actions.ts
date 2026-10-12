"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireRole, logAdminAction, type AdminRole } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";

export type ActionResult<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Counts non-disabled role='admin' rows other than (optionally) one excluded id -- the guard
 * every self-service-affecting action below uses to make sure the store never ends up with zero
 * admins able to manage staff. */
async function countOtherActiveAdmins(excludeAdminId?: string): Promise<number> {
  const { data } = await supabaseService.from("admin_users").select("id").eq("role", "admin").eq("disabled", false);
  return (data ?? []).filter((r) => r.id !== excludeAdminId).length;
}

export async function inviteStaff(email: string, role: AdminRole): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;

  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: "Ange en giltig e-postadress." };
  if (role !== "admin" && role !== "staff") return { ok: false, error: "Okänd roll." };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jawhara.se";
  const { data: invited, error: inviteError } = await supabaseService.auth.admin.inviteUserByEmail(trimmed, {
    redirectTo: `${siteUrl}/admin/reset-password`,
  });
  if (inviteError || !invited?.user) {
    return { ok: false, error: inviteError?.message ?? "Kunde inte skicka inbjudan." };
  }

  const { data: row, error: insertError } = await supabaseService
    .from("admin_users")
    .insert({ auth_user_id: invited.user.id, role, invited_by: admin.adminId })
    .select("id")
    .single();
  if (insertError || !row) {
    return { ok: false, error: insertError?.message ?? "Kunde inte skapa admin-kontot." };
  }

  await logAdminAction(admin.adminId, "staff.invite", "admin_user", row.id, { email: trimmed, role });
  revalidatePath("/admin/staff");
  return { ok: true, data: { id: row.id } };
}

export async function updateStaffRole(adminUserId: string, role: AdminRole): Promise<ActionResult> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;
  if (role !== "admin" && role !== "staff") return { ok: false, error: "Okänd roll." };

  if (adminUserId === admin.adminId) {
    return { ok: false, error: "Du kan inte ändra din egen roll." };
  }
  if (role === "staff") {
    const { data: target } = await supabaseService.from("admin_users").select("role").eq("id", adminUserId).maybeSingle();
    if (target?.role === "admin" && (await countOtherActiveAdmins(adminUserId)) === 0) {
      return { ok: false, error: "Det måste finnas minst en aktiv administratör kvar." };
    }
  }

  const { error } = await supabaseService.from("admin_users").update({ role }).eq("id", adminUserId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "staff.update_role", "admin_user", adminUserId, { role });
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function setStaffDisabled(adminUserId: string, disabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;

  if (adminUserId === admin.adminId) {
    return { ok: false, error: "Du kan inte inaktivera ditt eget konto." };
  }
  if (disabled) {
    const { data: target } = await supabaseService.from("admin_users").select("role").eq("id", adminUserId).maybeSingle();
    if (target?.role === "admin" && (await countOtherActiveAdmins(adminUserId)) === 0) {
      return { ok: false, error: "Det måste finnas minst en aktiv administratör kvar." };
    }
  }

  const { error } = await supabaseService.from("admin_users").update({ disabled }).eq("id", adminUserId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, disabled ? "staff.disable" : "staff.enable", "admin_user", adminUserId);
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function removeStaff(adminUserId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const roleCheck = requireRole(admin, "admin");
  if (!roleCheck.ok) return roleCheck;

  if (adminUserId === admin.adminId) {
    return { ok: false, error: "Du kan inte ta bort ditt eget konto härifrån." };
  }
  const { data: target } = await supabaseService.from("admin_users").select("role, auth_user_id").eq("id", adminUserId).maybeSingle();
  if (!target) return { ok: false, error: "Kontot hittades inte." };
  if (target.role === "admin" && (await countOtherActiveAdmins(adminUserId)) === 0) {
    return { ok: false, error: "Det måste finnas minst en aktiv administratör kvar." };
  }

  // Removes only the admin_users row -- the underlying auth.users account (and its order/review
  // history as an actor on old audit_log/orders rows, all of which use on delete set null) is left
  // alone. This revokes admin access immediately (every auth layer checks admin_users membership)
  // without destroying historical attribution.
  const { error } = await supabaseService.from("admin_users").delete().eq("id", adminUserId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "staff.remove", "admin_user", adminUserId);
  revalidatePath("/admin/staff");
  return { ok: true };
}
