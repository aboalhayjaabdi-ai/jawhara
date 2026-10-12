import type { AdminRole } from "@/lib/admin/auth";
import { AdminSearchField } from "./admin-search";

export function AdminTopbar({ email, role }: { email: string | null; role: AdminRole }) {
  return (
    <div className="hidden h-16 flex-shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-6 lg:flex">
      {/* Global search spans customers/discounts/etc. -- out of scope for the restricted
          "fulfillment_staff" role (orders + products view only, see lib/admin/permissions.ts). */}
      {role !== "fulfillment_staff" && (
        <div className="max-w-md flex-1">
          <AdminSearchField />
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {email && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm text-gray-600">{email}</span>
          </div>
        )}
      </div>
    </div>
  );
}
