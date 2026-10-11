// Shared CSV parsing + diff + commit logic for the product CSV import wizard. Used by both the
// preview and commit API routes so the row-matching logic behind "what will this import do" and
// "what did this import actually do" can never drift apart from each other.
//
// Column shape mirrors app/api/admin/products/export/route.ts exactly, for an honest export ->
// edit -> re-import round trip. Upsert key is Handle for products (the one column the schema
// actually enforces unique) and the option1/2/3 tuple for variants, falling back to SKU as
// secondary disambiguation (no unique constraint exists on sku). A blank cell always means
// "leave this field unchanged" on update -- there is deliberately no way to clear a field to
// empty via CSV; a genuine field-clear is an edit on the product's own admin page. Import only
// ever creates or updates rows; it never deletes a product/variant that's simply missing from
// the uploaded file.
import { supabaseService } from "@/lib/supabase/service-client";

export type ParsedVariantRow = {
  rowNumber: number;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  compareAtPrice: number | null;
  inventoryQuantity: number | null;
  inventoryTracked: boolean | null;
  inventoryPolicy: string | null;
  weight: number | null;
  weightUnit: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export type ParsedProductGroup = {
  handle: string;
  title: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[] | null;
  status: string | null;
  templateSuffix: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  descriptionHtml: string | null;
  variants: ParsedVariantRow[];
};

const VALID_STATUSES = ["active", "draft", "archived"];
const VALID_POLICIES = ["DENY", "CONTINUE"];

/** Minimal RFC4180 CSV parser -- handles quoted fields with embedded commas/newlines/escaped
 * quotes. No external dependency needed at this scale (admin-uploaded product catalogs, not
 * arbitrary user-generated CSV). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function toNumberOrNull(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBoolOrNull(v: string | undefined): boolean | null {
  if (v == null || v.trim() === "") return null;
  return ["true", "1", "yes", "ja"].includes(v.trim().toLowerCase());
}
function str(v: string | undefined): string | null {
  return v == null || v.trim() === "" ? null : v.trim();
}

export function parseProductsCsv(csvText: string): { groups: ParsedProductGroup[]; errors: string[] } {
  const errors: string[] = [];
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { groups: [], errors: ["Filen är tom."] };

  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const handleIdx = idx("Handle");
  if (handleIdx === -1) return { groups: [], errors: ['Kolumnen "Handle" saknas -- filen kan inte importeras.'] };

  const col = {
    handle: handleIdx,
    title: idx("Title"),
    vendor: idx("Vendor"),
    productType: idx("Product Type"),
    tags: idx("Tags"),
    status: idx("Status"),
    templateSuffix: idx("Template Suffix"),
    seoTitle: idx("SEO Title"),
    seoDescription: idx("SEO Description"),
    bodyHtml: idx("Body HTML"),
    option1: idx("Option1 Value"),
    option2: idx("Option2 Value"),
    option3: idx("Option3 Value"),
    sku: idx("Variant SKU"),
    barcode: idx("Variant Barcode"),
    price: idx("Variant Price"),
    compareAtPrice: idx("Variant Compare At Price"),
    inventoryQty: idx("Variant Inventory Qty"),
    inventoryTracked: idx("Variant Inventory Tracked"),
    inventoryPolicy: idx("Variant Inventory Policy"),
    weight: idx("Variant Weight"),
    weightUnit: idx("Variant Weight Unit"),
  };

  const groups: ParsedProductGroup[] = [];
  let current: ParsedProductGroup | null = null;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const handle = cells[col.handle]?.trim();
    if (!handle) {
      errors.push(`Rad ${r + 1}: saknar Handle, raden hoppades över.`);
      continue;
    }

    if (!current || current.handle !== handle) {
      current = {
        handle,
        title: str(cells[col.title]),
        vendor: str(cells[col.vendor]),
        productType: str(cells[col.productType]),
        tags: str(cells[col.tags]) ? cells[col.tags].split(",").map((t) => t.trim()).filter(Boolean) : null,
        status: str(cells[col.status]),
        templateSuffix: str(cells[col.templateSuffix]),
        seoTitle: str(cells[col.seoTitle]),
        seoDescription: str(cells[col.seoDescription]),
        descriptionHtml: str(cells[col.bodyHtml]),
        variants: [],
      };
      groups.push(current);
    }

    current.variants.push({
      rowNumber: r + 1,
      sku: str(cells[col.sku]),
      barcode: str(cells[col.barcode]),
      price: toNumberOrNull(cells[col.price]),
      compareAtPrice: toNumberOrNull(cells[col.compareAtPrice]),
      inventoryQuantity: toNumberOrNull(cells[col.inventoryQty]),
      inventoryTracked: toBoolOrNull(cells[col.inventoryTracked]),
      inventoryPolicy: str(cells[col.inventoryPolicy]),
      weight: toNumberOrNull(cells[col.weight]),
      weightUnit: str(cells[col.weightUnit]),
      option1: str(cells[col.option1]),
      option2: str(cells[col.option2]),
      option3: str(cells[col.option3]),
    });
  }

  return { groups, errors };
}

type ExistingVariant = {
  id: string;
  sku: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

function optionKey(o1: string | null, o2: string | null, o3: string | null): string {
  return [o1 ?? "", o2 ?? "", o3 ?? ""].join("||");
}

/** Matches a parsed CSV variant row against one of a product's existing variants: option1/2/3
 * tuple first, SKU second. Shared by diffAgainstDatabase (counting only) and commitImport
 * (the real write) so the two can never disagree about which row is "the same" variant. */
function matchVariant(existing: ExistingVariant[], used: Set<string>, parsed: ParsedVariantRow): ExistingVariant | null {
  const wantKey = optionKey(parsed.option1, parsed.option2, parsed.option3);
  if (wantKey !== "||") {
    const byOption = existing.find((v) => !used.has(v.id) && optionKey(v.option1, v.option2, v.option3) === wantKey);
    if (byOption) return byOption;
  }
  if (parsed.sku) {
    const bySku = existing.find((v) => !used.has(v.id) && v.sku === parsed.sku);
    if (bySku) return bySku;
  }
  if (existing.length === 1 && parsed.option1 == null && parsed.option2 == null && parsed.option3 == null && !used.has(existing[0].id)) {
    return existing[0];
  }
  return null;
}

export type PreviewGroup = {
  handle: string;
  title: string | null;
  action: "create" | "update";
  productId: string | null;
  variantsToCreate: number;
  variantsToUpdate: number;
  warnings: string[];
  errors: string[];
};

export async function diffAgainstDatabase(groups: ParsedProductGroup[]): Promise<PreviewGroup[]> {
  const handles = groups.map((g) => g.handle);
  const { data: existingProducts } = await supabaseService
    .from("products")
    .select("id, handle, product_variants(id, sku, option1, option2, option3)")
    .in("handle", handles);
  const byHandle = new Map((existingProducts ?? []).map((p: any) => [p.handle, p]));

  const { data: templates } = await supabaseService.from("product_templates").select("key");
  const knownTemplateKeys = new Set((templates ?? []).map((t: any) => t.key));

  return groups.map((g) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const existing = byHandle.get(g.handle) as any;
    const action: "create" | "update" = existing ? "update" : "create";

    if (action === "create" && !g.title) errors.push("Ny produkt saknar Title.");
    if (g.status && !VALID_STATUSES.includes(g.status)) errors.push(`Okänd status "${g.status}" (tillåtna: active, draft, archived).`);
    if (g.templateSuffix && !knownTemplateKeys.has(g.templateSuffix)) warnings.push(`Okänd produktmall-nyckel "${g.templateSuffix}" -- sparas, men renderas utan mallinnehåll.`);

    const existingVariants: ExistingVariant[] = existing?.product_variants ?? [];
    const used = new Set<string>();
    let toCreate = 0;
    let toUpdate = 0;
    for (const v of g.variants) {
      const match = action === "update" ? matchVariant(existingVariants, used, v) : null;
      if (match) {
        used.add(match.id);
        toUpdate++;
      } else {
        toCreate++;
        if (v.price == null) errors.push(`Ny variant (rad ${v.rowNumber}) saknar Variant Price.`);
        if (v.inventoryPolicy && !VALID_POLICIES.includes(v.inventoryPolicy)) errors.push(`Okänd Variant Inventory Policy "${v.inventoryPolicy}" (rad ${v.rowNumber}).`);
      }
    }

    return {
      handle: g.handle,
      title: g.title ?? existing?.title ?? null,
      action,
      productId: existing?.id ?? null,
      variantsToCreate: toCreate,
      variantsToUpdate: toUpdate,
      warnings,
      errors,
    };
  });
}

export type CommitGroupResult = { handle: string; ok: boolean; action: "create" | "update"; productId?: string; error?: string };

export async function commitImport(groups: ParsedProductGroup[], actorId: string): Promise<CommitGroupResult[]> {
  const results: CommitGroupResult[] = [];

  for (const g of groups) {
    try {
      results.push(await commitOneGroup(g));
    } catch (err: any) {
      results.push({ handle: g.handle, ok: false, action: "update", error: err?.message ?? "Okänt fel." });
    }
  }

  await import("@/lib/admin/auth").then(({ logAdminAction }) =>
    logAdminAction(actorId, "products.import_csv", undefined, undefined, {
      groupCount: groups.length,
      created: results.filter((r) => r.ok && r.action === "create").length,
      updated: results.filter((r) => r.ok && r.action === "update").length,
      failed: results.filter((r) => !r.ok).length,
    })
  );

  return results;
}

async function commitOneGroup(g: ParsedProductGroup): Promise<CommitGroupResult> {
  if (g.status && !VALID_STATUSES.includes(g.status)) return { handle: g.handle, ok: false, action: "update", error: `Okänd status "${g.status}".` };

  const { data: existing } = await supabaseService
    .from("products")
    .select("id, handle, product_variants(id, sku, option1, option2, option3)")
    .eq("handle", g.handle)
    .maybeSingle();

  let productId: string;
  const action: "create" | "update" = existing ? "update" : "create";

  if (!existing) {
    if (!g.title) return { handle: g.handle, ok: false, action: "create", error: "Ny produkt saknar Title." };
    const { data: created, error } = await supabaseService
      .from("products")
      .insert({
        handle: g.handle,
        title: g.title,
        vendor: g.vendor,
        product_type: g.productType,
        tags: g.tags ?? [],
        status: g.status ?? "draft",
        template_suffix: g.templateSuffix,
        seo_title: g.seoTitle,
        seo_description: g.seoDescription,
        description_html: g.descriptionHtml,
        source: "manual",
      })
      .select("id")
      .single();
    if (error || !created) return { handle: g.handle, ok: false, action: "create", error: error?.message ?? "Kunde inte skapa produkten." };
    productId = created.id;
  } else {
    productId = existing.id;
    const update: Record<string, unknown> = {};
    if (g.title != null) update.title = g.title;
    if (g.vendor != null) update.vendor = g.vendor;
    if (g.productType != null) update.product_type = g.productType;
    if (g.tags != null) update.tags = g.tags;
    if (g.status != null) update.status = g.status;
    if (g.templateSuffix != null) update.template_suffix = g.templateSuffix;
    if (g.seoTitle != null) update.seo_title = g.seoTitle;
    if (g.seoDescription != null) update.seo_description = g.seoDescription;
    if (g.descriptionHtml != null) update.description_html = g.descriptionHtml;
    if (Object.keys(update).length > 0) {
      const { error } = await supabaseService.from("products").update(update).eq("id", productId);
      if (error) return { handle: g.handle, ok: false, action, error: error.message };
    }
  }

  const existingVariants: ExistingVariant[] = existing?.product_variants ?? [];
  const used = new Set<string>();

  for (const v of g.variants) {
    const match = existing ? matchVariant(existingVariants, used, v) : null;
    if (match) {
      used.add(match.id);
      const update: Record<string, unknown> = {};
      if (v.sku != null) update.sku = v.sku;
      if (v.barcode != null) update.barcode = v.barcode;
      if (v.price != null) update.price = v.price;
      if (v.compareAtPrice != null) update.compare_at_price = v.compareAtPrice;
      if (v.inventoryQuantity != null) update.inventory_quantity = v.inventoryQuantity;
      if (v.inventoryTracked != null) update.inventory_tracked = v.inventoryTracked;
      if (v.inventoryPolicy != null) update.inventory_policy = v.inventoryPolicy;
      if (v.weight != null) update.weight = v.weight;
      if (v.weightUnit != null) update.weight_unit = v.weightUnit;
      if (v.option1 != null) update.option1 = v.option1;
      if (v.option2 != null) update.option2 = v.option2;
      if (v.option3 != null) update.option3 = v.option3;
      if (Object.keys(update).length > 0) {
        const { error } = await supabaseService.from("product_variants").update(update).eq("id", match.id);
        if (error) return { handle: g.handle, ok: false, action, error: `Variant (rad ${v.rowNumber}): ${error.message}` };
      }
    } else {
      if (v.price == null) return { handle: g.handle, ok: false, action, error: `Ny variant (rad ${v.rowNumber}) saknar Variant Price.` };
      const { error } = await supabaseService.from("product_variants").insert({
        product_id: productId,
        title: [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || "Default Title",
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        inventory_quantity: v.inventoryQuantity ?? 0,
        inventory_tracked: v.inventoryTracked ?? true,
        inventory_policy: v.inventoryPolicy,
        weight: v.weight,
        weight_unit: v.weightUnit ?? "kg",
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
      });
      if (error) return { handle: g.handle, ok: false, action, error: `Ny variant (rad ${v.rowNumber}): ${error.message}` };
    }
  }

  return { handle: g.handle, ok: true, action, productId };
}
