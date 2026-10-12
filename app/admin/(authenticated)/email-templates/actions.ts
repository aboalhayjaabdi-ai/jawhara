"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { sendEmail } from "@/lib/email/send";
import { renderSampleEmail } from "@/lib/email/sample-data";
import { getEmailTemplateById } from "@/lib/admin/email-templates";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type EmailTemplateDraftInput = { subject: string; heading: string; introHtml: string; outroHtml: string };

export async function updateEmailTemplateDraft(id: string, input: EmailTemplateDraftInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!input.subject.trim() || !input.heading.trim()) return { ok: false, error: "Ämne och rubrik krävs." };
  if (!input.subject.includes("{{orderNumber}}")) return { ok: false, error: "Ämnesraden måste innehålla platshållaren {{orderNumber}}." };

  const { error } = await supabaseService
    .from("email_templates")
    .update({
      draft_subject: input.subject,
      draft_heading: input.heading,
      draft_intro_html: input.introHtml,
      draft_outro_html: input.outroHtml || null,
      updated_at: new Date().toISOString(),
      updated_by: admin.adminId,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "email_templates.update_draft", "email_template", id);
  revalidatePath(`/admin/email-templates/${id}`);
  revalidatePath("/admin/email-templates");
  return { ok: true };
}

export async function publishEmailTemplate(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data: row, error: readError } = await supabaseService.from("email_templates").select("draft_subject, draft_heading, draft_intro_html, draft_outro_html").eq("id", id).single();
  if (readError || !row) return { ok: false, error: readError?.message ?? "Mallen hittades inte." };

  const { error } = await supabaseService
    .from("email_templates")
    .update({
      subject: row.draft_subject,
      heading: row.draft_heading,
      intro_html: row.draft_intro_html,
      outro_html: row.draft_outro_html,
      published_at: new Date().toISOString(),
      published_by: admin.adminId,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "email_templates.publish", "email_template", id);
  revalidatePath(`/admin/email-templates/${id}`);
  revalidatePath("/admin/email-templates");
  return { ok: true };
}

export async function discardEmailTemplateDraft(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { data: row, error: readError } = await supabaseService.from("email_templates").select("subject, heading, intro_html, outro_html").eq("id", id).single();
  if (readError || !row) return { ok: false, error: readError?.message ?? "Mallen hittades inte." };

  const { error } = await supabaseService
    .from("email_templates")
    .update({ draft_subject: row.subject, draft_heading: row.heading, draft_intro_html: row.intro_html, draft_outro_html: row.outro_html })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(admin.adminId, "email_templates.discard_draft", "email_template", id);
  revalidatePath(`/admin/email-templates/${id}`);
  return { ok: true };
}

/** Sends a real email via the real Resend send path, but only ever to the signed-in admin's own
 * address, with synthetic sample order data and a "[TEST]" subject prefix -- never a real
 * customer, never real order data. Uses the DRAFT content, so an admin can see exactly what an
 * edit will look like in a real inbox before publishing it. */
export async function sendTestEmail(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.email) return { ok: false, error: "Ditt konto saknar en e-postadress att skicka till." };

  const template = await getEmailTemplateById(id);
  if (!template) return { ok: false, error: "Mallen hittades inte." };

  const { subject, html } = renderSampleEmail(template.key, template.draft);
  try {
    await sendEmail({ to: admin.email, subject: `[TEST] ${subject}`, html });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Kunde inte skicka testmejlet." };
  }

  await logAdminAction(admin.adminId, "email_templates.send_test", "email_template", id, { to: admin.email });
  return { ok: true };
}
