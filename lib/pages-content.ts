// DB-backed since Phase 4 of the admin-completion roadmap (content_pages table) -- was a
// hardcoded object before. The original content (migrated from Shopify verbatim, plus two
// explicitly-approved corrections -- see docs/phase4-content-management-verification-report.md)
// now lives in the database and is editable at /admin/content; this file is just the read path.
import { cache } from "react";
import { supabase } from "./supabase/client";

export type HtmlPageContent = { type: "html"; title: string; bodyHtml: string };
export type FaqPageContent = { type: "faq"; title: string; items: { q: string; a: string }[] };
export type ContactPageContent = { type: "contact"; title: string; intro: string; emailNote: string };

export type PageContent = HtmlPageContent | FaqPageContent | ContactPageContent;

// cache()'d: the /pages/[handle] route's generateMetadata() and its page component both call
// this with the same handle -- without dedup, that's two serial Supabase round trips before the
// page can start rendering.
export const getPageContent = cache(async (handle: string): Promise<PageContent | null> => {
  const { data } = await supabase
    .from("content_pages")
    .select("type, title, body_html, faq_items, contact_intro, contact_email_note")
    .eq("handle", handle)
    .maybeSingle();
  if (!data) return null;

  if (data.type === "html") return { type: "html", title: data.title, bodyHtml: data.body_html ?? "" };
  if (data.type === "faq") return { type: "faq", title: data.title, items: data.faq_items ?? [] };
  return { type: "contact", title: data.title, intro: data.contact_intro ?? "", emailNote: data.contact_email_note ?? "" };
});

/** Every page handle, for the sitemap -- replaces the old `Object.keys(PAGES)`. */
export async function getAllPageHandles(): Promise<string[]> {
  const { data } = await supabase.from("content_pages").select("handle");
  return (data ?? []).map((r) => r.handle);
}
