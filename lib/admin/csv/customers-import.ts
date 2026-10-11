// Shared CSV parsing + diff + commit logic for the customer CSV import wizard. Mirrors
// lib/admin/csv/products-import.ts's parse -> diff -> commit shape exactly, reusing its generic
// parser (lib/admin/csv/parse.ts).
//
// Natural dedup key is email, case-insensitively -- but unlike products.handle, customers.email
// has no unique constraint in the schema (confirmed: real migrated data could contain genuine
// duplicates), so this is a SOFT match, same reasoning as Phase 3's product_templates.key. A row
// with no email can never be matched against an existing customer -- it always creates a new one.
// A blank cell always means "leave this field unchanged" on update, same convention as products.
import { supabaseService } from "@/lib/supabase/service-client";
import { parseCsv, toBoolOrNull, str } from "./parse";

export type ParsedCustomerRow = {
  rowNumber: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  acceptsMarketing: boolean | null;
  tags: string[] | null;
  note: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
};

export function parseCustomersCsv(csvText: string): { rows: ParsedCustomerRow[]; errors: string[] } {
  const errors: string[] = [];
  const parsed = parseCsv(csvText);
  if (parsed.length === 0) return { rows: [], errors: ["Filen är tom."] };

  const header = parsed[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    email: idx("Email"),
    firstName: idx("First Name"),
    lastName: idx("Last Name"),
    phone: idx("Phone"),
    acceptsMarketing: idx("Accepts Marketing"),
    tags: idx("Tags"),
    note: idx("Note"),
    company: idx("Company"),
    address1: idx("Address1"),
    address2: idx("Address2"),
    city: idx("City"),
    province: idx("Province"),
    zip: idx("Zip"),
    country: idx("Country"),
    countryCode: idx("Country Code"),
  };
  if (col.email === -1 && col.firstName === -1 && col.lastName === -1) {
    return { rows: [], errors: ['Kolumnerna "Email", "First Name" och "Last Name" saknas alla -- filen kan inte tolkas.'] };
  }

  const rows: ParsedCustomerRow[] = [];
  for (let r = 1; r < parsed.length; r++) {
    const cells = parsed[r];
    const email = str(cells[col.email]);
    const firstName = str(cells[col.firstName]);
    const lastName = str(cells[col.lastName]);
    if (!email && !firstName && !lastName) {
      errors.push(`Rad ${r + 1}: saknar e-post och namn, raden hoppades över.`);
      continue;
    }
    rows.push({
      rowNumber: r + 1,
      email,
      firstName,
      lastName,
      phone: str(cells[col.phone]),
      acceptsMarketing: toBoolOrNull(cells[col.acceptsMarketing]),
      tags: str(cells[col.tags]) ? cells[col.tags].split(",").map((t) => t.trim()).filter(Boolean) : null,
      note: str(cells[col.note]),
      company: str(cells[col.company]),
      address1: str(cells[col.address1]),
      address2: str(cells[col.address2]),
      city: str(cells[col.city]),
      province: str(cells[col.province]),
      zip: str(cells[col.zip]),
      country: str(cells[col.country]),
      countryCode: str(cells[col.countryCode]),
    });
  }

  return { rows, errors };
}

export type PreviewRow = {
  rowNumber: number;
  email: string | null;
  name: string | null;
  action: "create" | "update";
  customerId: string | null;
  errors: string[];
  warnings: string[];
};

export async function diffCustomersAgainstDatabase(rows: ParsedCustomerRow[]): Promise<PreviewRow[]> {
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const { data: existing } = emails.length
    ? await supabaseService.from("customers").select("id, email").not("email", "is", null)
    : { data: [] as { id: string; email: string }[] };
  const byLowerEmail = new Map((existing ?? []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));

  return rows.map((r) => {
    const existingId = r.email ? byLowerEmail.get(r.email.toLowerCase()) ?? null : null;
    const warnings: string[] = [];
    if (!r.email) warnings.push("Ingen e-post -- kan inte matchas mot en befintlig kund, skapas alltid som ny.");
    return {
      rowNumber: r.rowNumber,
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
      action: existingId ? "update" : "create",
      customerId: existingId,
      errors: [],
      warnings,
    };
  });
}

export type CommitRowResult = { rowNumber: number; email: string | null; ok: boolean; action: "create" | "update"; customerId?: string; error?: string };

export async function commitCustomersImport(rows: ParsedCustomerRow[], actorId: string): Promise<CommitRowResult[]> {
  const results: CommitRowResult[] = [];
  for (const row of rows) {
    try {
      results.push(await commitOneRow(row));
    } catch (err: any) {
      results.push({ rowNumber: row.rowNumber, email: row.email, ok: false, action: "update", error: err?.message ?? "Okänt fel." });
    }
  }

  await import("@/lib/admin/auth").then(({ logAdminAction }) =>
    logAdminAction(actorId, "customers.import_csv", undefined, undefined, {
      rowCount: rows.length,
      created: results.filter((r) => r.ok && r.action === "create").length,
      updated: results.filter((r) => r.ok && r.action === "update").length,
      failed: results.filter((r) => !r.ok).length,
    })
  );

  return results;
}

async function commitOneRow(row: ParsedCustomerRow): Promise<CommitRowResult> {
  let existing: { id: string } | null = null;
  if (row.email) {
    const { data } = await supabaseService.from("customers").select("id").ilike("email", row.email).maybeSingle();
    existing = data;
  }

  let customerId: string;
  const action: "create" | "update" = existing ? "update" : "create";

  if (!existing) {
    const { data: created, error } = await supabaseService
      .from("customers")
      .insert({
        email: row.email,
        first_name: row.firstName,
        last_name: row.lastName,
        phone: row.phone,
        accepts_marketing: row.acceptsMarketing ?? false,
        marketing_consent_updated_at: row.acceptsMarketing ? new Date().toISOString() : null,
        tags: row.tags ?? [],
        note: row.note,
        source: "manual",
      })
      .select("id")
      .single();
    if (error || !created) return { rowNumber: row.rowNumber, email: row.email, ok: false, action, error: error?.message ?? "Kunde inte skapa kunden." };
    customerId = created.id;
  } else {
    customerId = existing.id;
    const update: Record<string, unknown> = {};
    if (row.firstName != null) update.first_name = row.firstName;
    if (row.lastName != null) update.last_name = row.lastName;
    if (row.phone != null) update.phone = row.phone;
    if (row.acceptsMarketing != null) {
      update.accepts_marketing = row.acceptsMarketing;
      update.marketing_consent_updated_at = new Date().toISOString();
    }
    if (row.tags != null) update.tags = row.tags;
    if (row.note != null) update.note = row.note;
    if (Object.keys(update).length > 0) {
      const { error } = await supabaseService.from("customers").update(update).eq("id", customerId);
      if (error) return { rowNumber: row.rowNumber, email: row.email, ok: false, action, error: error.message };
    }
  }

  const hasAddressData = row.address1 || row.city || row.zip || row.country;
  if (hasAddressData) {
    const { data: defaultAddress } = await supabaseService.from("addresses").select("id").eq("customer_id", customerId).eq("is_default", true).maybeSingle();
    const addressRow: Record<string, unknown> = {
      company: row.company,
      address1: row.address1,
      address2: row.address2,
      city: row.city,
      province: row.province,
      zip: row.zip,
      country: row.country,
      country_code: row.countryCode,
    };
    if (defaultAddress) {
      const update = Object.fromEntries(Object.entries(addressRow).filter(([, v]) => v != null));
      await supabaseService.from("addresses").update(update).eq("id", defaultAddress.id);
    } else {
      await supabaseService.from("addresses").insert({ customer_id: customerId, is_default: true, first_name: row.firstName, last_name: row.lastName, ...addressRow });
    }
  }

  return { rowNumber: row.rowNumber, email: row.email, ok: true, action, customerId };
}
