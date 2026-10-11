"use client";

import { useEffect, useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  reorderSectionsAction,
  setSectionVisibleAction,
  addSectionAction,
  deleteSectionAction,
  publishHomeLayoutAction,
  discardDraftAction,
} from "@/app/admin/(authenticated)/storefront/actions/sections";
import { SectionEditPanel } from "@/components/admin/section-edit-panel";
import type { Section, SectionType } from "@/lib/admin/storefront-layout";

type LayoutMeta = {
  draftSectionCount: number;
  publishedSectionCount: number;
  draftUpdatedAt: string | null;
  publishedUpdatedAt: string | null;
  hasUnpublishedChanges: boolean;
  currentVersion: number;
};

const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  hero: "Hero-banner",
  marquee: "Rullande text",
  product_list: "Produktlista",
  text: "Textavsnitt",
  collection_links: "Kollektionslänkar",
  featured_product: "Utvald produkt",
  comparison_slider: "Jämförelseslider",
};

function sectionSummary(section: Section): string {
  const c = section.config as any;
  switch (section.type) {
    case "hero":
      return c.heading ? String(c.heading).split("\n")[0] : c.buttonText ?? "";
    case "marquee":
      return (c.items ?? []).join(" · ");
    case "product_list":
      return c.heading ?? c.collectionHandle ?? "";
    case "text":
      return c.text ?? "";
    case "collection_links":
      return (c.handles ?? []).join(", ");
    case "featured_product":
      return c.handle ?? "";
    case "comparison_slider":
      return c.heading ?? "";
    default:
      return "";
  }
}

function SortableSectionRow({
  section,
  allCollections,
  isOpen,
  onToggleOpen,
  onToggleVisible,
  onDelete,
  onSaved,
}: {
  section: Section;
  allCollections: { handle: string; title: string }[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleVisible: (visible: boolean) => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <span {...attributes} {...listeners} className="cursor-grab select-none text-gray-400 active:cursor-grabbing" aria-label="Dra för att ändra ordning">
          ⠿
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">{SECTION_TYPE_LABEL[section.type]}</div>
          <div className="truncate text-xs text-gray-400">{sectionSummary(section)}</div>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={section.visible} onChange={(e) => onToggleVisible(e.target.checked)} />
          Synlig
        </label>
        <button type="button" onClick={onToggleOpen} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
          {isOpen ? "Stäng" : "Redigera"}
        </button>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-rose-600 hover:text-rose-700">
            Ta bort
          </button>
        ) : (
          <>
            <button type="button" onClick={onDelete} className="text-xs font-medium text-rose-700">
              Bekräfta
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">
              Avbryt
            </button>
          </>
        )}
      </div>
      {isOpen && (
        <div className="px-3 pb-3">
          <SectionEditPanel section={section} allCollections={allCollections} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

export function StorefrontEditor({ initialSections, meta }: { initialSections: Section[]; meta: LayoutMeta }) {
  const [sections, setSections] = useState(initialSections);
  const [currentMeta, setCurrentMeta] = useState(meta);
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [allCollections, setAllCollections] = useState<{ handle: string; title: string }[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [showPublish, setShowPublish] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    fetch("/api/admin/storefront/collections")
      .then((r) => r.json())
      .then((d) => setAllCollections(d.collections ?? []));
  }, []);

  function refreshPreview() {
    setPreviewNonce((n) => n + 1);
    setCurrentMeta((m) => ({ ...m, hasUnpublishedChanges: true }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() => {
        reorderSectionsAction(next.map((s) => s.id)).then(refreshPreview);
      });
      return next;
    });
  }

  function handleToggleVisible(id: string, visible: boolean) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, visible } : s)));
    startTransition(() => {
      setSectionVisibleAction(id, visible).then(refreshPreview);
    });
  }

  function handleDelete(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
    startTransition(() => {
      deleteSectionAction(id).then(refreshPreview);
    });
  }

  function handleAdd(type: SectionType) {
    setAddMenuOpen(false);
    startTransition(async () => {
      const result = await addSectionAction(type, sections.length > 0 ? sections[sections.length - 1].id : null);
      if (result.ok) {
        setSections((prev) => [...prev, result.section]);
        setOpenId(result.section.id);
        refreshPreview();
      }
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishHomeLayoutAction(publishNote || null);
      if (result.ok) {
        setMessage(`Publicerad som version ${result.version}.`);
        setShowPublish(false);
        setPublishNote("");
        setCurrentMeta((m) => ({ ...m, hasUnpublishedChanges: false, currentVersion: result.version }));
      } else {
        setMessage(result.error);
      }
    });
  }

  function handleDiscard() {
    startTransition(async () => {
      const result = await discardDraftAction();
      if (result.ok) window.location.reload();
    });
  }

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">
      <div className="flex w-[420px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {currentMeta.hasUnpublishedChanges ? "Opublicerade ändringar" : "Inga opublicerade ändringar"} · v{currentMeta.currentVersion}
          </span>
          <div className="flex items-center gap-2">
            {currentMeta.hasUnpublishedChanges && (
              <button type="button" onClick={handleDiscard} className="text-xs text-gray-500 underline hover:text-gray-900">
                Återställ utkast
              </button>
            )}
            <button type="button" onClick={() => setShowPublish(true)} className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800">
              Publicera
            </button>
          </div>
        </div>

        {showPublish && (
          <div className="border-b border-gray-200 bg-white p-3">
            <label className="text-xs text-gray-500">Anteckning (valfri)</label>
            <input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm" placeholder="Vad ändrades?" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handlePublish} disabled={isPending} className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                {isPending ? "Publicerar…" : "Bekräfta publicering"}
              </button>
              <button type="button" onClick={() => setShowPublish(false)} className="text-xs text-gray-500">
                Avbryt
              </button>
            </div>
          </div>
        )}
        {message && <div className="border-b border-gray-200 bg-white px-3 py-2 text-xs text-emerald-600">{message}</div>}

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sections.map((s) => (
                <SortableSectionRow
                  key={s.id}
                  section={s}
                  allCollections={allCollections}
                  isOpen={openId === s.id}
                  onToggleOpen={() => setOpenId(openId === s.id ? null : s.id)}
                  onToggleVisible={(v) => handleToggleVisible(s.id, v)}
                  onDelete={() => handleDelete(s.id)}
                  onSaved={refreshPreview}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="relative border-t border-gray-200 bg-white p-3">
          <button type="button" onClick={() => setAddMenuOpen((v) => !v)} className="w-full rounded-md border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:border-gray-400">
            + Lägg till sektion
          </button>
          {addMenuOpen && (
            <div className="absolute inset-x-3 bottom-14 rounded-md border border-gray-200 bg-white shadow-lg">
              {(Object.keys(SECTION_TYPE_LABEL) as SectionType[]).map((type) => (
                <button key={type} type="button" onClick={() => handleAdd(type)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                  {SECTION_TYPE_LABEL[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        <div className="flex items-center justify-center gap-2 border-b border-gray-200 bg-white py-2">
          <button
            type="button"
            onClick={() => setPreviewMode("desktop")}
            className={`rounded-md px-3 py-1 text-xs font-medium ${previewMode === "desktop" ? "bg-gray-900 text-white" : "text-gray-600"}`}
          >
            Skrivbord
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("mobile")}
            className={`rounded-md px-3 py-1 text-xs font-medium ${previewMode === "mobile" ? "bg-gray-900 text-white" : "text-gray-600"}`}
          >
            Mobil
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto p-4">
          <iframe
            key={previewNonce}
            src={`/preview?t=${previewNonce}`}
            title="Förhandsgranskning"
            className={`h-full bg-white shadow ${previewMode === "mobile" ? "w-[390px]" : "w-full"}`}
          />
        </div>
      </div>
    </div>
  );
}
