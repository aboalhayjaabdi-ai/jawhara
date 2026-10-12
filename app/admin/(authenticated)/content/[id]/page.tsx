import Link from "next/link";
import { notFound } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/server-auth";
import { HtmlPageForm } from "@/components/admin/content-html-form";
import { FaqPageForm } from "@/components/admin/content-faq-form";
import { ContactPageForm } from "@/components/admin/content-contact-form";

export const dynamic = "force-dynamic";

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createAuthServerClient();
  const { data: p } = await supabase.from("content_pages").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/content" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← Innehåll
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold text-gray-900">{p.title}</h1>
      <p className="mb-6 text-xs text-gray-400">/pages/{p.handle}</p>

      {p.type === "html" && <HtmlPageForm id={p.id} handle={p.handle} initialTitle={p.title} initialBodyHtml={p.body_html ?? ""} />}
      {p.type === "faq" && <FaqPageForm id={p.id} handle={p.handle} initialTitle={p.title} initialItems={p.faq_items ?? []} />}
      {p.type === "contact" && (
        <ContactPageForm id={p.id} handle={p.handle} initialTitle={p.title} initialIntro={p.contact_intro ?? ""} initialEmailNote={p.contact_email_note ?? ""} />
      )}
    </div>
  );
}
