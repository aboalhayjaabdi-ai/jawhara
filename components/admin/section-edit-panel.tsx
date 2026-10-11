"use client";

import { useState, useTransition } from "react";
import { updateSectionConfigAction } from "@/app/admin/(authenticated)/storefront/actions/sections";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import type { Section } from "@/lib/admin/storefront-layout";

type CollectionOption = { handle: string; title: string };

export function SectionEditPanel({
  section,
  allCollections,
  onSaved,
}: {
  section: Section;
  allCollections: CollectionOption[];
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<Record<string, any>>(section.config);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<{ handle: string; title: string }[]>([]);

  function set(key: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateSectionConfigAction(section.id, config);
      if (result.ok) {
        setMessage("Sparat.");
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  async function searchProducts(q: string) {
    setProductQuery(q);
    if (q.trim().length < 2) {
      setProductResults([]);
      return;
    }
    const res = await fetch(`/api/admin/storefront/products?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setProductResults(data.products ?? []);
  }

  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      {section.type === "hero" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={config.variant === "centered-cta"} onChange={() => set("variant", "centered-cta")} /> Centrerad knapp
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={config.variant === "split-bottom"} onChange={() => set("variant", "split-bottom")} /> Rubrik + knapp
            </label>
          </div>
          <ImageUploadField label="Skrivbordsbild" value={config.desktopImage ?? ""} onChange={(url) => set("desktopImage", url)} />
          <ImageUploadField label="Mobilbild (valfri, faller tillbaka på skrivbordsbilden)" value={config.mobileImage ?? ""} onChange={(url) => set("mobileImage", url)} />
          {config.variant === "split-bottom" && (
            <div>
              <label className="text-xs text-gray-500">Rubriktext (radbryt med Enter)</label>
              <textarea value={config.heading ?? ""} onChange={(e) => set("heading", e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Knapptext</label>
              <input value={config.buttonText ?? ""} onChange={(e) => set("buttonText", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Knapplänk</label>
              <input value={config.buttonHref ?? ""} onChange={(e) => set("buttonHref", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Höjd (CSS, t.ex. 720px eller 100vh)</label>
            <input value={config.height ?? ""} onChange={(e) => set("height", e.target.value)} className="mt-1 w-32 rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </>
      )}

      {section.type === "marquee" && (
        <div>
          <label className="text-xs text-gray-500">Rullande texter (en per rad)</label>
          <textarea
            value={(config.items ?? []).join("\n")}
            onChange={(e) => set("items", e.target.value.split("\n"))}
            rows={4}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      )}

      {section.type === "product_list" && (
        <>
          <div>
            <label className="text-xs text-gray-500">Rubrik</label>
            <input value={config.heading ?? ""} onChange={(e) => set("heading", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Kollektion</label>
            <select value={config.collectionHandle ?? ""} onChange={(e) => set("collectionHandle", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
              <option value="">Välj kollektion…</option>
              <option value="all">Alla produkter</option>
              {allCollections.map((c) => (
                <option key={c.handle} value={c.handle}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Antal produkter</label>
              <input type="number" min={1} value={config.limit ?? 4} onChange={(e) => set("limit", Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Layout</label>
              <select value={config.layout ?? "grid"} onChange={(e) => set("layout", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm">
                <option value="grid">Rutnät</option>
                <option value="carousel">Karusell</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Knapptext (valfri, standard "Visa alla")</label>
              <input value={config.buttonText ?? ""} onChange={(e) => set("buttonText", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Knapplänk (valfri)</label>
              <input value={config.buttonHref ?? ""} onChange={(e) => set("buttonHref", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
        </>
      )}

      {section.type === "text" && (
        <div>
          <label className="text-xs text-gray-500">Text</label>
          <input value={config.text ?? ""} onChange={(e) => set("text", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
        </div>
      )}

      {section.type === "collection_links" && (
        <>
          <div>
            <label className="text-xs text-gray-500">Rubrik (valfri)</label>
            <input value={config.heading ?? ""} onChange={(e) => set("heading", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Kollektioner (visas i tur och ordning)</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
              {allCollections.map((c) => {
                const handles: string[] = config.handles ?? [];
                const checked = handles.includes(c.handle);
                return (
                  <label key={c.handle} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => set("handles", e.target.checked ? [...handles, c.handle] : handles.filter((h) => h !== c.handle))}
                    />
                    {c.title}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}

      {section.type === "featured_product" && (
        <div>
          <label className="text-xs text-gray-500">Produkt</label>
          {config.handle ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
              <span>{config.handle}</span>
              <button type="button" onClick={() => set("handle", "")} className="text-xs text-gray-500 underline">
                Byt
              </button>
            </div>
          ) : (
            <>
              <input
                value={productQuery}
                onChange={(e) => searchProducts(e.target.value)}
                placeholder="Sök produkt…"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              {productResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {productResults.map((p) => (
                    <button
                      key={p.handle}
                      type="button"
                      onClick={() => {
                        set("handle", p.handle);
                        setProductResults([]);
                        setProductQuery("");
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {section.type === "comparison_slider" && (
        <>
          <ImageUploadField label="Bild före" value={config.beforeImage ?? ""} onChange={(url) => set("beforeImage", url)} />
          <ImageUploadField label="Bild efter" value={config.afterImage ?? ""} onChange={(url) => set("afterImage", url)} />
          <div>
            <label className="text-xs text-gray-500">Rubrik (valfri)</label>
            <input value={config.heading ?? ""} onChange={(e) => set("heading", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Knapptext (valfri)</label>
              <input value={config.buttonText ?? ""} onChange={(e) => set("buttonText", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Knapplänk (valfri)</label>
              <input value={config.buttonHref ?? ""} onChange={(e) => set("buttonHref", e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
        </>
      )}

      {error && <div className="text-sm text-rose-600">{error}</div>}
      {message && <div className="text-sm text-emerald-600">{message}</div>}
      <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50">
        {isPending ? "Sparar…" : "Spara"}
      </button>
    </div>
  );
}
