"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addProductsToCollection, removeProductFromCollection, reorderCollectionProducts } from "@/app/admin/(authenticated)/collections/[id]/actions/membership";

export type MemberProduct = { id: string; title: string; thumbnailUrl: string | null };

function SortableRow({ product, onRemove }: { product: MemberProduct; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm">
      <span {...attributes} {...listeners} className="cursor-grab text-gray-300 active:cursor-grabbing">
        ⠿
      </span>
      <div className="relative h-8 w-8 overflow-hidden rounded bg-gray-100">
        {product.thumbnailUrl && <Image src={product.thumbnailUrl} alt="" fill className="object-cover" sizes="32px" />}
      </div>
      <Link href={`/admin/products/${product.id}`} className="flex-1 text-gray-900 hover:underline">
        {product.title}
      </Link>
      <button type="button" onClick={() => onRemove(product.id)} className="text-xs text-rose-600 hover:text-rose-700">
        Ta bort
      </button>
    </div>
  );
}

export function CollectionProductsManager({ collectionId, initialMembers }: { collectionId: string; initialMembers: MemberProduct[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const memberIds = new Set(members.map((m) => m.id));
    setResults((data.products ?? []).filter((p: any) => !memberIds.has(p.id)));
  }

  function addProduct(product: { id: string; title: string }) {
    setMembers((prev) => [...prev, { id: product.id, title: product.title, thumbnailUrl: null }]);
    setQuery("");
    setResults([]);
    startTransition(() => {
      addProductsToCollection(collectionId, [product.id]);
    });
  }

  function removeProduct(productId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== productId));
    startTransition(async () => {
      const result = await removeProductFromCollection(collectionId, productId);
      if (result.discountWarning?.length) setWarning(`Påverkar aktiva rabatter: ${result.discountWarning.join(", ")}`);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setMembers((prev) => {
      const oldIndex = prev.findIndex((m) => m.id === active.id);
      const newIndex = prev.findIndex((m) => m.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() => {
        reorderCollectionProducts(collectionId, next.map((m) => m.id));
      });
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Produkter i kollektionen ({members.length})</div>

      <div className="relative mb-3">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Sök och lägg till produkt…"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => addProduct(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                {p.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {warning && <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</div>}

      {members.length === 0 ? (
        <p className="text-sm text-gray-400">Inga produkter i den här kollektionen.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="rounded-md border border-gray-100">
              {members.map((m) => (
                <SortableRow key={m.id} product={m} onRemove={removeProduct} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
