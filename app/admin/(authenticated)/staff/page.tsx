import { requireAdmin } from "@/lib/admin/auth";
import { listStaff } from "@/lib/admin/staff";
import { StaffList } from "@/components/admin/staff-list";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const admin = await requireAdmin();

  if (admin.role !== "admin") {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Personal</h1>
        <p className="text-sm text-gray-500">
          Den här sidan är endast tillgänglig för administratörer. Kontakta en administratör om du behöver hantera
          personalkonton.
        </p>
      </div>
    );
  }

  const staff = await listStaff();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Personal</h1>
      <p className="mb-6 text-xs text-gray-500">Bjud in medarbetare, hantera roller och inaktivera åtkomst.</p>
      <StaffList initial={staff} selfAdminId={admin.adminId} />
    </div>
  );
}
