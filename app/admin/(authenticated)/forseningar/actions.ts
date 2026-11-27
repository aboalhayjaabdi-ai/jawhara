"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { sendDelayNotice } from "@/lib/email/delay-notice";

/** "Skicka förseningsmejl" for one order (after it has been checked on 17TRACK). */
export async function sendDelayNoticeAction(orderId: string): Promise<void> {
  const admin = await requireAdmin();
  const result = await sendDelayNotice(orderId, admin.adminId);
  await logAdminAction(admin.adminId, "orders.delay_notice", "order", orderId, result.ok ? { sent: true } : { sent: false, error: result.error });
  revalidatePath("/admin/forseningar");
}
