import { requireAdmin } from "@/lib/admin/auth";

// No sidebar/topbar here (this route group is a sibling of (authenticated), not nested inside
// it) -- a packing slip is meant to be printed/saved as a PDF cleanly, not framed by the admin
// shell. Protected independently via requireAdmin(), on top of middleware.ts's own /admin/* gate.
export default async function AdminPrintLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="min-h-screen bg-white">{children}</div>;
}
