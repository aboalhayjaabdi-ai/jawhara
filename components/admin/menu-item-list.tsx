"use client";

import { useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderMenuItemsAction, addMenuItemAction, updateMenuItemAction, deleteMenuItemAction } from "@/app/admin/(authenticated)/storefront/menus/actions";
import type { Menu, MenuItem } from "@/lib/admin/storefront-menus";

function SortableItemRow({ item, onEdit, onDelete }: { item: MenuItem; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
      <span {...attributes} {...listeners} className="cursor-grab select-none text-gray-400 active:cursor-grabbing">
        ⠿
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-900">{item.title}</div>
        <div className="truncate text-xs text-gray-400">{item.href}</div>
      </div>
      <button type="button" onClick={onEdit} className="text-xs font-medium text-gray-700 underline hover:text-gray-900">
        Redigera
      </button>
      {!confirmDelete ? (
        <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-rose-600">
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
  );
}

export function MenuItemList({ menu }: { menu: Menu }) {
  const [items, setItems] = useState(menu.items);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editHref, setEditHref] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newHref, setNewHref] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() => {
        reorderMenuItemsAction(menu.id, next.map((i) => i.id));
      });
      return next;
    });
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditHref(item.href);
  }

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const result = await updateMenuItemAction(editingId!, editTitle, editHref);
      if (result.ok) {
        setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, title: editTitle, href: editHref } : i)));
        setEditingId(null);
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => {
      deleteMenuItemAction(id);
    });
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addMenuItemAction(menu.id, newTitle, newHref);
      if (result.ok) {
        setItems((prev) => [...prev, { id: crypto.randomUUID(), title: newTitle, href: newHref, position: prev.length }]);
        setNewTitle("");
        setNewHref("");
        setAdding(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-900">{menu.label}</div>
      <div className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) =>
              editingId === item.id ? (
                <div key={item.id} className="rounded-md border border-gray-300 bg-white p-2">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titel" className="mb-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm" />
                  <input value={editHref} onChange={(e) => setEditHref(e.target.value)} placeholder="Länk" className="mb-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm" />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
                      Spara
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-500">
                      Avbryt
                    </button>
                  </div>
                </div>
              ) : (
                <SortableItemRow key={item.id} item={item} onEdit={() => startEdit(item)} onDelete={() => handleDelete(item.id)} />
              )
            )}
          </SortableContext>
        </DndContext>
      </div>

      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}

      {adding ? (
        <div className="mt-2 rounded-md border border-gray-300 bg-white p-2">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titel" className="mb-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm" />
          <input value={newHref} onChange={(e) => setNewHref(e.target.value)} placeholder="Länk (t.ex. /collections/armband)" className="mb-1 w-full rounded-md border border-gray-200 px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white">
              Lägg till
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-500">
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 w-full rounded-md border border-dashed border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-400">
          + Lägg till länk
        </button>
      )}
    </div>
  );
}
