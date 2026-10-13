import { supabaseService } from "@/lib/supabase/service-client";
import type { EmailTemplateContent } from "@/lib/email/templates";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/email-templates.ts must never be imported into client code");
}

export type EmailTemplateKey = "order_confirmation" | "shipping_confirmation" | "refund_notification" | "order_cancellation";

export type EmailTemplateRow = {
  id: string;
  key: EmailTemplateKey;
  name: string;
  live: EmailTemplateContent;
  draft: EmailTemplateContent;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

function toLive(row: any): EmailTemplateContent {
  return { subject: row.subject, heading: row.heading, introHtml: row.intro_html, outroHtml: row.outro_html };
}
function toDraft(row: any): EmailTemplateContent {
  return { subject: row.draft_subject, heading: row.draft_heading, introHtml: row.draft_intro_html, outroHtml: row.draft_outro_html };
}
function hasDiff(a: EmailTemplateContent, b: EmailTemplateContent): boolean {
  return a.subject !== b.subject || a.heading !== b.heading || a.introHtml !== b.introHtml || (a.outroHtml ?? "") !== (b.outroHtml ?? "");
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  const { data } = await supabaseService.from("email_templates").select("*").order("name");
  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    live: toLive(row),
    draft: toDraft(row),
    hasUnpublishedChanges: hasDiff(toLive(row), toDraft(row)),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }));
}

export async function getEmailTemplateById(id: string): Promise<EmailTemplateRow | null> {
  const { data } = await supabaseService.from("email_templates").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    key: data.key,
    name: data.name,
    live: toLive(data),
    draft: toDraft(data),
    hasUnpublishedChanges: hasDiff(toLive(data), toDraft(data)),
    publishedAt: data.published_at,
    updatedAt: data.updated_at,
  };
}

/** The only function the real send path (lib/email/order-confirmation.ts etc.) calls -- always
 * reads the published (live) content, never the draft, so an in-progress unpublished edit can
 * never reach a real customer email. */
export async function getLiveEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplateContent> {
  const { data, error } = await supabaseService.from("email_templates").select("subject, heading, intro_html, outro_html").eq("key", key).single();
  if (error || !data) throw new Error(`No email_templates row for key "${key}" -- this is a real configuration error, not something to silently work around.`);
  return { subject: data.subject, heading: data.heading, introHtml: data.intro_html, outroHtml: data.outro_html };
}
