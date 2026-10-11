"use client";

import { useState, useTransition } from "react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { updateProductCore } from "@/app/admin/(authenticated)/products/[id]/actions/core";

export function ProductCoreForm({
  productId,
  initial,
  templateOptions,
}: {
  productId: string;
  initial: { title: string; vendor: string | null; productType: string | null; descriptionHtml: string | null; tags: string[]; templateSuffix: string | null };
  templateOptions: { key: string; name: string }[];
}) {
  const [title, setTitle] = useState(initial.title);
  const [vendor, setVendor] = useState(initial.vendor ?? "");
  const [productType, setProductType] = useState(initial.productType ?? "");
  const [description, setDescription] = useState(initial.descriptionHtml ?? "");
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));
  const [templateSuffix, setTemplateSuffix] = useState(initial.templateSuffix ?? "");
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProductCore(productId, {
        title,
        vendor: vendor || null,
        productType: productType || null,
        descriptionHtml: description || null,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        templateSuffix: templateSuffix || null,
      });
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Produktinformation</div>
        {status === "saved" && <span className="text-xs text-emerald-600">Sparat</span>}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500">Titel</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Beskrivning</label>
          <div className="mt-1">
            <RichTextEditor value={description} onChange={setDescription} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Leverantör</label>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Produkttyp</label>
            <input value={productType} onChange={(e) => setProductType(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Taggar</label>
          <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="komma, separerade, taggar" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Produktmall</label>
          <select value={templateSuffix} onChange={(e) => setTemplateSuffix(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
            <option value="">Ingen mall</option>
            {templateOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
