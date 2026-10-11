"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderMedia, setAltText, assignVariantImage, deleteMedia } from "@/app/admin/(authenticated)/products/[id]/actions/media";

export type MediaItem = { id: string; url: string; altText: string | null; variantId: string | null };
export type VariantOption = { id: string; label: string };

function SortableImage({
  item,
  variants,
  onAltChange,
  onAssign,
  onDelete,
}: {
  item: MediaItem;
  variants: VariantOption[];
  onAltChange: (id: string, alt: string) => void;
  onAssign: (id: string, variantId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-gray-200 bg-white p-2">
      <div {...attributes} {...listeners} className="relative mb-2 aspect-square w-full cursor-grab overflow-hidden rounded bg-gray-100 active:cursor-grabbing">
        <Image src={item.url} alt={item.altText ?? ""} fill className="object-cover" sizes="160px" />
      </div>
      <input
        defaultValue={item.altText ?? ""}
        onBlur={(e) => onAltChange(item.id, e.target.value)}
        placeholder="Alt-text"
        className="mb-1 w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
      />
      <select
        value={item.variantId ?? ""}
        onChange={(e) => onAssign(item.id, e.target.value || null)}
        className="mb-1 w-full rounded border border-gray-200 px-1.5 py-1 text-xs"
      >
        <option value="">Ingen variant</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onDelete(item.id)} className="w-full text-xs text-rose-600 hover:text-rose-700">
        Ta bort
      </button>
    </div>
  );
}

export function ProductMediaManager({ productId, initialMedia, variants }: { productId: string; initialMedia: MediaItem[]; variants: VariantOption[] }) {
  const [items, setItems] = useState(initialMedia);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() => {
        reorderMedia(productId, next.map((i) => i.id));
      });
      return next;
    });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/products/${productId}/media`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Uppladdning misslyckades.");
        continue;
      }
      setItems((prev) => [...prev, { id: data.mediaId, url: data.url, altText: null, variantId: null }]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleAltChange(id: string, alt: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, altText: alt } : i)));
    startTransition(() => {
      setAltText(productId, id, alt);
    });
  }

  function handleAssign(id: string, variantId: string | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, variantId } : i.variantId === variantId ? { ...i, variantId: null } : i)));
    startTransition(() => {
      assignVariantImage(productId, id, variantId);
    });
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => {
      deleteMedia(productId, id);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bilder</div>
        <label className="cursor-pointer text-xs font-medium text-gray-700 underline hover:text-gray-900">
          {uploading ? "Laddar upp…" : "+ Ladda upp"}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
        </label>
      </div>
      {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Inga bilder uppladdade.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <SortableImage key={item.id} item={item} variants={variants} onAltChange={handleAltChange} onAssign={handleAssign} onDelete={handleDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
