"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmailTemplateDraft, publishEmailTemplate, discardEmailTemplateDraft, sendTestEmail } from "@/app/admin/(authenticated)/email-templates/actions";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import type { EmailTemplateContent } from "@/lib/email/templates";

function formatDate(iso: string | null) {
  if (!iso) return "Aldrig publicerad";
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EmailTemplateEditor({
  id,
  draft,
  hasUnpublishedChanges,
  publishedAt,
}: {
  id: string;
  draft: EmailTemplateContent;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft.subject);
  const [heading, setHeading] = useState(draft.heading);
  const [introHtml, setIntroHtml] = useState(draft.introHtml);
  const [outroHtml, setOutroHtml] = useState(draft.outroHtml ?? "");
  const [previewVersion, setPreviewVersion] = useState<"draft" | "live">("draft");
  const [previewKey, setPreviewKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveDraft() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateEmailTemplateDraft(id, { subject, heading, introHtml, outroHtml });
      if (result.ok) {
        setNotice("Utkast sparat.");
        setPreviewKey((k) => k + 1);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handlePublish() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const saveResult = await updateEmailTemplateDraft(id, { subject, heading, introHtml, outroHtml });
      if (!saveResult.ok) {
        setError(saveResult.error);
        return;
      }
      const result = await publishEmailTemplate(id);
      if (result.ok) {
        setNotice("Publicerat. Riktiga kundmejl använder nu denna version.");
        setPreviewKey((k) => k + 1);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDiscard() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await discardEmailTemplateDraft(id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSendTest() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const saveResult = await updateEmailTemplateDraft(id, { subject, heading, introHtml, outroHtml });
      if (!saveResult.ok) {
        setError(saveResult.error);
        return;
      }
      const result = await sendTestEmail(id);
      if (result.ok) {
        setNotice("Testmejl skickat till din egen e-postadress.");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
          {hasUnpublishedChanges ? (
            <span className="text-amber-700">Det finns opublicerade ändringar.</span>
          ) : (
            <span className="text-emerald-700">Utkast matchar den publicerade versionen.</span>
          )}{" "}
          Senast publicerad: {formatDate(publishedAt)}.
        </div>

        <div>
          <label className="text-xs text-gray-500">Ämnesrad</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-gray-400">Måste innehålla platshållaren {"{{orderNumber}}"}, som ersätts med det riktiga ordernumret.</p>
        </div>

        <div>
          <label className="text-xs text-gray-500">Rubrik i mejlet</label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Inledningstext</label>
          <RichTextEditor value={introHtml} onChange={setIntroHtml} />
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-500">Avslutningstext (valfri)</label>
          <RichTextEditor value={outroHtml} onChange={setOutroHtml} />
        </div>

        <p className="text-xs text-gray-400">
          Ordernummer, radposter, summor, leveransadress och spårningsinformation är alltid riktiga uppgifter från beställningen
          och redigeras inte här.
        </p>

        {error && <div className="text-sm text-rose-600">{error}</div>}
        {notice && <div className="text-sm text-emerald-600">{notice}</div>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSaveDraft} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            Spara utkast
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Publicera
          </button>
          <button type="button" onClick={handleDiscard} disabled={isPending} className="rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Återställ utkast
          </button>
          <button type="button" onClick={handleSendTest} disabled={isPending} className="rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {isPending ? "Skickar…" : "Skicka testmejl till mig"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Förhandsgranskning (exempeldata)</span>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setPreviewVersion("draft")}
              className={`rounded-md px-2 py-1 ${previewVersion === "draft" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              Utkast
            </button>
            <button
              type="button"
              onClick={() => setPreviewVersion("live")}
              className={`rounded-md px-2 py-1 ${previewVersion === "live" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              Publicerad
            </button>
          </div>
        </div>
        <iframe
          key={`${previewVersion}-${previewKey}`}
          src={`/api/admin/email-templates/${id}/preview?version=${previewVersion}`}
          className="h-[600px] w-full rounded-lg border border-gray-200 bg-white"
          title="Förhandsgranskning av e-postmall"
        />
      </div>
    </div>
  );
}
