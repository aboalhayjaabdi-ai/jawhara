"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { createProductTemplate, updateProductTemplate, type ProductTemplateInput } from "@/app/admin/(authenticated)/product-templates/actions";

type HeadingBody = { heading: string; body: string };
type QA = { question: string; answer: string };

export function ProductTemplateForm({ id, initial }: { id?: string; initial: ProductTemplateInput }) {
  const router = useRouter();
  const [key, setKey] = useState(initial.key);
  const [name, setName] = useState(initial.name);
  const [introParagraph, setIntroParagraph] = useState(initial.introParagraph ?? "");
  const [trustLines, setTrustLines] = useState((initial.trustLines ?? []).join("\n"));
  const [uspBlock, setUspBlock] = useState<HeadingBody[]>(initial.uspBlock ?? []);
  const [faq, setFaq] = useState<QA[]>(initial.faq ?? []);
  const [descriptionHeading, setDescriptionHeading] = useState(initial.descriptionHeading);
  const [accordionRows, setAccordionRows] = useState<HeadingBody[]>(initial.accordionRows ?? []);
  const [sizeGuideHref, setSizeGuideHref] = useState(initial.sizeGuideHref ?? "");
  const [offerHeading, setOfferHeading] = useState(initial.offerMessage?.heading ?? "");
  const [offerBody, setOfferBody] = useState(initial.offerMessage?.body ?? "");
  const [offerHref, setOfferHref] = useState(initial.offerMessage?.href ?? "");
  const [showInventoryStatus, setShowInventoryStatus] = useState(initial.showInventoryStatus);
  const [galleryLayout, setGalleryLayout] = useState(initial.galleryLayout);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildInput(): ProductTemplateInput {
    return {
      key: key.trim(),
      name: name.trim(),
      introParagraph: introParagraph || null,
      trustLines: trustLines.trim() ? trustLines.split("\n").map((l) => l.trim()).filter(Boolean) : null,
      uspBlock: uspBlock.length ? uspBlock : null,
      faq: faq.length ? faq : null,
      descriptionHeading: descriptionHeading || "Specifikationer",
      accordionRows,
      sizeGuideHref: sizeGuideHref || null,
      offerMessage: offerHeading.trim() ? { heading: offerHeading, body: offerBody, href: offerHref.trim() || null } : null,
      showInventoryStatus,
      galleryLayout,
    };
  }

  function save() {
    setError(null);
    const input = buildInput();
    if (!input.key || !input.name) {
      setError("Nyckel och namn krävs.");
      return;
    }
    startTransition(async () => {
      const result = id ? await updateProductTemplate(id, input) : await createProductTemplate(input);
      if (result.ok) {
        if (!id && "id" in result) router.push(`/admin/product-templates/${result.id}`);
        else router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Grunduppgifter</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Nyckel (template_suffix)</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} disabled={!!id} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Namn</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Intro</div>
        <RichTextEditor value={introParagraph} onChange={setIntroParagraph} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Förtroenderader (en per rad)</div>
        <textarea value={trustLines} onChange={(e) => setTrustLines(e.target.value)} rows={4} className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">USP-block</div>
          <button type="button" onClick={() => setUspBlock((p) => [...p, { heading: "", body: "" }])} className="text-xs text-gray-700 underline">
            + Lägg till
          </button>
        </div>
        {uspBlock.map((item, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input
              value={item.heading}
              onChange={(e) => setUspBlock((p) => p.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))}
              placeholder="Rubrik"
              className="w-1/3 rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
            <input
              value={item.body}
              onChange={(e) => setUspBlock((p) => p.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
              placeholder="Text"
              className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
            <button type="button" onClick={() => setUspBlock((p) => p.filter((_, j) => j !== i))} className="text-xs text-rose-600">
              Ta bort
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">FAQ</div>
          <button type="button" onClick={() => setFaq((p) => [...p, { question: "", answer: "" }])} className="text-xs text-gray-700 underline">
            + Lägg till
          </button>
        </div>
        {faq.map((item, i) => (
          <div key={i} className="mb-2 space-y-1 rounded border border-gray-100 p-2">
            <input
              value={item.question}
              onChange={(e) => setFaq((p) => p.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
              placeholder="Fråga"
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
            <textarea
              value={item.answer}
              onChange={(e) => setFaq((p) => p.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              placeholder="Svar"
              rows={2}
              className="w-full resize-none rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
            <button type="button" onClick={() => setFaq((p) => p.filter((_, j) => j !== i))} className="text-xs text-rose-600">
              Ta bort
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Beskrivningssektion</div>
        <label className="text-xs text-gray-500">Rubrik</label>
        <input value={descriptionHeading} onChange={(e) => setDescriptionHeading(e.target.value)} className="mt-1 mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />

        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Accordion-rader</span>
          <button type="button" onClick={() => setAccordionRows((p) => [...p, { heading: "", body: "" }])} className="text-xs text-gray-700 underline">
            + Lägg till
          </button>
        </div>
        {accordionRows.map((row, i) => (
          <div key={i} className="mb-3 space-y-1 rounded border border-gray-100 p-2">
            <input
              value={row.heading}
              onChange={(e) => setAccordionRows((p) => p.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))}
              placeholder="Rubrik"
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
            <RichTextEditor value={row.body} onChange={(html) => setAccordionRows((p) => p.map((x, j) => (j === i ? { ...x, body: html } : x)))} />
            <button type="button" onClick={() => setAccordionRows((p) => p.filter((_, j) => j !== i))} className="text-xs text-rose-600">
              Ta bort
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Övrigt</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Storleksguide-länk</label>
            <input value={sizeGuideHref} onChange={(e) => setSizeGuideHref(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Galleri-layout</label>
            <select value={galleryLayout} onChange={(e) => setGalleryLayout(e.target.value as any)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              <option value="grid">Rutnät</option>
              <option value="carousel">Karusell</option>
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showInventoryStatus} onChange={(e) => setShowInventoryStatus(e.target.checked)} /> Visa lagerstatus
        </label>

        <div className="mt-3">
          <label className="text-xs text-gray-500">Erbjudandemeddelande (valfritt)</label>
          <input value={offerHeading} onChange={(e) => setOfferHeading(e.target.value)} placeholder="Rubrik" className="mt-1 mb-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          <input value={offerBody} onChange={(e) => setOfferBody(e.target.value)} placeholder="Text" className="mb-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          <input value={offerHref} onChange={(e) => setOfferHref(e.target.value)} placeholder="Länk (valfritt, t.ex. /collections/tillbehor)" className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}
      <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara mall"}
      </button>
    </div>
  );
}
