"use client";

import { useState, useTransition } from "react";
import { inviteStaff, updateStaffRole, setStaffDisabled, removeStaff } from "@/app/admin/(authenticated)/staff/actions";
import type { StaffRow } from "@/lib/admin/staff";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

export function StaffList({ initial, selfAdminId }: { initial: StaffRow[]; selfAdminId: string }) {
  const [rows, setRows] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Ange en e-postadress.");
      return;
    }
    startTransition(async () => {
      const result = await inviteStaff(email, role);
      if (result.ok) {
        setEmail("");
        setNotice(`Inbjudan skickad till ${email.trim()}.`);
        setRows((prev) => [...prev, { id: result.data.id, authUserId: "", email: email.trim(), role, disabled: false, invitedByEmail: null, lastSignInAt: null, createdAt: new Date().toISOString() }]);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRoleChange(id: string, newRole: "admin" | "staff") {
    setError(null);
    startTransition(async () => {
      const result = await updateStaffRole(id, newRole);
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: newRole } : r)));
      } else {
        setError(result.error);
      }
    });
  }

  function handleToggleDisabled(id: string, disabled: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setStaffDisabled(id, disabled);
      if (result.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, disabled } : r)));
      } else {
        setError(result.error);
      }
    });
  }

  function handleRemove(id: string) {
    setError(null);
    if (!confirm("Ta bort det här kontots admin-åtkomst permanent? Själva inloggningskontot påverkas inte.")) return;
    startTransition(async () => {
      const result = await removeStaff(id);
      if (result.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Bjud in medarbetare</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label className="text-xs text-gray-500">E-post</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
              type="email"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Roll</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm sm:w-auto">
              <option value="staff">Personal</option>
              <option value="admin">Administratör</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={handleInvite} disabled={isPending} className="w-full rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 sm:w-auto">
              {isPending ? "Skickar…" : "Skicka inbjudan"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Personalen får ett e-postmeddelande med en länk för att sätta sitt eget lösenord. Rollen "Administratör" kan hantera
          andra administratörskonton, kundens GDPR-export/radering och full åtkomst; "Personal" har samma åtkomst till det
          löpande arbetet men inte dessa känsliga åtgärder.
        </p>
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
        {notice && <div className="mt-2 text-sm text-emerald-600">{notice}</div>}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Roll</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Senast inloggad</th>
              <th className="px-4 py-3">Inbjuden av</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelf = r.id === selfAdminId;
              return (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-900">
                    {r.email} {isSelf && <span className="text-xs text-gray-400">(du)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.role}
                      disabled={isSelf || isPending}
                      onChange={(e) => handleRoleChange(r.id, e.target.value as "admin" | "staff")}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="staff">Personal</option>
                      <option value="admin">Administratör</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {r.disabled ? (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Inaktiverad</span>
                    ) : (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Aktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(r.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-gray-400">{r.invitedByEmail ?? "—"}</td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => handleToggleDisabled(r.id, !r.disabled)} disabled={isPending} className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50">
                          {r.disabled ? "Aktivera" : "Inaktivera"}
                        </button>
                        <button type="button" onClick={() => handleRemove(r.id)} disabled={isPending} className="text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50">
                          Ta bort
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Ingen personal ännu.</p>}
      </div>
    </div>
  );
}
