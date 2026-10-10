import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPageContent } from "@/lib/pages-content";
import { FaqAccordion } from "@/components/pages/faq-accordion";
import { ContactForm } from "@/components/pages/contact-form";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const content = getPageContent(handle);
  // No real SEO title/description exists in the Shopify export for any page (verified during
  // extraction) -- falling back to the real page title rather than inventing meta copy.
  return { title: content?.title ?? "Jawhara" };
}

export default async function StaticPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const content = getPageContent(handle);
  if (!content) notFound();

  return (
    <div className="mx-auto max-w-[760px] px-6 py-16 lg:px-0">
      <h1 className="mb-10 text-4xl">{content.title}</h1>

      {content.type === "html" && (
        <div
          className="text-[15px] leading-7 text-muted [&_a]:text-fg [&_a]:underline [&_h4]:mt-8 [&_h4]:mb-2 [&_h4]:text-fg [&_h4]:text-base [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h5]:mt-5 [&_h5]:mb-1 [&_h5]:text-fg [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:uppercase [&_p]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2 [&_th]:text-left [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
        />
      )}

      {content.type === "faq" && <FaqAccordion items={content.items} />}

      {content.type === "contact" && (
        <div>
          <p className="mb-8 text-sm leading-6 text-muted">{content.intro}</p>
          <ContactForm />
          <p className="mt-8 text-sm text-muted">{content.emailNote}</p>
        </div>
      )}
    </div>
  );
}
