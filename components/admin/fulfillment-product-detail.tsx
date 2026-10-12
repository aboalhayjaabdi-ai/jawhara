"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { AdminLocale } from "@/lib/admin/auth";
import { t } from "@/lib/admin/i18n";

export type FulfillmentVariant = {
  id: string;
  sku: string | null;
  price: number;
  inventoryQuantity: number;
  inventoryTracked: boolean;
  inventoryPolicy: "DENY" | "CONTINUE" | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export type FulfillmentImage = { id: string; url: string };

function variantLabel(v: FulfillmentVariant): string {
  return [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || "—";
}

function stockLabel(v: FulfillmentVariant, locale: AdminLocale): string {
  if (!v.inventoryTracked) return t(locale, "product.stock.untracked");
  if (v.inventoryQuantity > 0 || v.inventoryPolicy === "CONTINUE") return `${t(locale, "product.stock.inStock")} (${v.inventoryQuantity})`;
  return t(locale, "product.stock.outOfStock");
}

/**
 * Read-only product detail for the restricted "fulfillment_staff" role (see
 * lib/admin/permissions.ts) -- view title/images/description/variants only, nothing editable.
 * Reachable from the order detail page's clickable item links, which carry the exact purchased
 * variant through as `?variant=<id>`; `highlightVariantId` scrolls to and highlights that row so
 * the right color/size is unambiguous even on a product with many variants.
 */
export function FulfillmentProductDetail({
  images,
  description,
  variants,
  highlightVariantId,
  locale,
}: {
  images: FulfillmentImage[];
  description: string | null;
  variants: FulfillmentVariant[];
  highlightVariantId?: string;
  locale: AdminLocale;
}) {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (highlightVariantId) rowRefs.current[highlightVariantId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightVariantId]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "product.images")}</div>
        {images.length === 0 ? (
          <p className="text-sm text-gray-400">{t(locale, "product.noImages")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
                <Image src={img.url} alt="" fill sizes="150px" className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {description && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "product.description")}</div>
          <p className="whitespace-pre-line text-sm text-gray-700">{description}</p>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(locale, "product.variants")}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-5 py-2">{t(locale, "product.col.option")}</th>
              <th className="px-5 py-2">{t(locale, "product.col.sku")}</th>
              <th className="px-5 py-2">{t(locale, "product.col.price")}</th>
              <th className="px-5 py-2">{t(locale, "product.col.stock")}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr
                key={v.id}
                ref={(el) => {
                  rowRefs.current[v.id] = el;
                }}
                className={`border-b border-gray-50 last:border-0 ${v.id === highlightVariantId ? "bg-amber-50" : ""}`}
              >
                <td className="px-5 py-3 text-gray-900">{variantLabel(v)}</td>
                <td className="px-5 py-3 text-gray-500">{v.sku || "—"}</td>
                <td className="px-5 py-3 text-gray-900">{Math.round(v.price)} kr</td>
                <td className="px-5 py-3 text-gray-500">{stockLabel(v, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
