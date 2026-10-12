"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addComplementaryProducts, removeComplementaryProduct, reorderComplementaryProducts } from "@/app/admin/(authenticated)/products/[id]/actions/complementary";

export type ComplementaryProduct = { id: string; title: string; thumbnailUrl: string | null };

function SortableRow({ product, onRemove }: { product: ComplementaryProduct; onRemove: (id: string) => void }) {
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

/** Admin UI for "Passar med" -- manually curated complementary products, mirroring
 * CollectionProductsManager's exact search/reorder/remove architecture (same /api/admin/products/
 * search typeahead, same dnd-kit drag pattern, same optimistic-update + Server Action shape).
 * Intentionally does NOT reuse the discount-impact warning from the collection manager --
 * product_complementary rows are never referenced by discount logic. */
export function ProductComplementaryManager({ productId, initial }: { productId: string; initial: ComplementaryProduct[] }) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Server Actions here trigger a revalidatePath, which can abort an overlapping in-flight
  // action request from the same component. Chaining every mutation through this queue ensures
  // they're always sent to the server one at a time, even if the admin adds/removes/reorders in
  // quick succession, so no call is ever silently dropped.
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  function enqueueMutation(run: () => Promise<unknown>) {
    mutationQueue.current = mutationQueue.current.then(run, run);
  }

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const itemIds = new Set(items.map((m) => m.id));
    setResults((data.products ?? []).filter((p: any) => p.id !== productId && !itemIds.has(p.id)));
  }

  function addItem(product: { id: string; title: string }) {
    setItems((prev) => [...prev, { id: product.id, title: product.title, thumbnailUrl: null }]);
    setQuery("");
    setResults([]);
    startTransition(() => {
      enqueueMutation(() => addComplementaryProducts(productId, [product.id]));
    });
  }

  function removeItem(complementaryProductId: string) {
    setItems((prev) => prev.filter((m) => m.id !== complementaryProductId));
    startTransition(() => {
      enqueueMutation(() => removeComplementaryProduct(productId, complementaryProductId));
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((m) => m.id === active.id);
      const newIndex = prev.findIndex((m) => m.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      startTransition(() => {
        enqueueMutation(() => reorderComplementaryProducts(productId, next.map((m) => m.id)));
      });
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Passar med ({items.length})</div>
      <p className="mb-3 text-xs text-gray-400">
        Manuellt utvalda produkter som visas under rubriken "Passar med" på produktsidan. Separat från de automatiska
        förslagen under "Du kanske också gillar".
      </p>

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
              <button key={p.id} type="button" onClick={() => addItem(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                {p.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Inga produkter valda.</p>
      ) : (
        // Explicit id -- prevents dnd-kit's auto-generated aria-describedby id from drifting
        // between the server render and client hydration pass (a known dnd-kit SSR quirk).
        <DndContext id="product-complementary-manager" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="rounded-md border border-gray-100">
              {items.map((m) => (
                <SortableRow key={m.id} product={m} onRemove={removeItem} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
