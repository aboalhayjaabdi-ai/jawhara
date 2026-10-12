import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmailTemplateById } from "@/lib/admin/email-templates";
import { EmailTemplateEditor } from "@/components/admin/email-template-editor";

export const dynamic = "force-dynamic";

export default async function EditEmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getEmailTemplateById(id);
  if (!template) notFound();

  return (
    <div className="max-w-5xl">
      <Link href="/admin/email-templates" className="text-xs uppercase tracking-wide text-gray-500 hover:text-gray-900">
        ← E-postmallar
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-gray-900">{template.name}</h1>
      <EmailTemplateEditor
        id={template.id}
        draft={template.draft}
        hasUnpublishedChanges={template.hasUnpublishedChanges}
        publishedAt={template.publishedAt}
      />
    </div>
  );
}
