import { supabaseService } from "@/lib/supabase/service-client";

if (typeof window !== "undefined") {
  throw new Error("lib/admin/storefront-layout.ts must never be imported into client code");
}

export type SectionType = "hero" | "marquee" | "product_list" | "text" | "collection_links" | "featured_product" | "comparison_slider";

export type Section = { id: string; type: SectionType; visible: boolean; config: Record<string, unknown> };

export type LayoutVersion = {
  version: number;
  note: string | null;
  publishedAt: string;
  sectionCount: number;
};

const DEFAULT_CONFIG: Record<SectionType, Record<string, unknown>> = {
  hero: { variant: "centered-cta", desktopImage: "", mobileImage: "", buttonText: "Handla nu", buttonHref: "/collections/all", height: "720px" },
  marquee: { items: ["Ny text"] },
  product_list: { collectionHandle: "", heading: "Ny sektion", limit: 4, layout: "grid" },
  text: { text: "Ny text" },
  collection_links: { heading: "", handles: [] },
  featured_product: { handle: "" },
  comparison_slider: { beforeImage: "", afterImage: "", heading: "", buttonText: "", buttonHref: "" },
};

async function getLayout(page: string, status: "draft" | "published") {
  const { data } = await supabaseService.from("storefront_layouts").select("id, sections").eq("page", page).eq("status", status).maybeSingle();
  if (!data) throw new Error(`Ingen ${status}-layout hittades för sidan "${page}".`);
  return { id: data.id as string, sections: (data.sections as Section[]) ?? [] };
}

async function saveDraftSections(page: string, sections: Section[], actorId: string) {
  const { error } = await supabaseService
    .from("storefront_layouts")
    .update({ sections, updated_at: new Date().toISOString(), updated_by: actorId })
    .eq("page", page)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
}

export async function getDraftSections(page = "home"): Promise<Section[]> {
  return (await getLayout(page, "draft")).sections;
}

export async function getLayoutMeta(page = "home") {
  const [{ data: draft }, { data: published }] = await Promise.all([
    supabaseService.from("storefront_layouts").select("sections, updated_at").eq("page", page).eq("status", "draft").maybeSingle(),
    supabaseService.from("storefront_layouts").select("sections, updated_at").eq("page", page).eq("status", "published").maybeSingle(),
  ]);
  const { data: latestVersion } = await supabaseService
    .from("storefront_layout_versions")
    .select("version")
    .eq("page", page)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasUnpublishedChanges = JSON.stringify(draft?.sections ?? []) !== JSON.stringify(published?.sections ?? []);
  return {
    draftSectionCount: (draft?.sections as Section[] | undefined)?.length ?? 0,
    publishedSectionCount: (published?.sections as Section[] | undefined)?.length ?? 0,
    draftUpdatedAt: draft?.updated_at ?? null,
    publishedUpdatedAt: published?.updated_at ?? null,
    hasUnpublishedChanges,
    currentVersion: latestVersion?.version ?? 0,
  };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Validates a section's config against real DB data where it matters -- never lets an admin
 * silently save a typo'd collection handle or product handle into a live-bound section. */
async function validateConfig(type: SectionType, config: Record<string, unknown>): Promise<string | null> {
  switch (type) {
    case "hero": {
      if (!config.desktopImage || typeof config.desktopImage !== "string") return "Skrivbordsbild krävs.";
      if (!config.buttonText || !config.buttonHref) return "Knapptext och knapplänk krävs.";
      if (config.variant === "split-bottom" && !config.heading) return "Rubrik krävs för denna varianten.";
      return null;
    }
    case "marquee": {
      const items = config.items;
      if (!Array.isArray(items) || items.length === 0 || items.some((i) => !String(i).trim())) return "Minst en text krävs.";
      return null;
    }
    case "product_list": {
      if (!config.heading) return "Rubrik krävs.";
      const handle = String(config.collectionHandle ?? "");
      if (!handle) return "Kollektion krävs.";
      if (handle !== "all") {
        const { data } = await supabaseService.from("collections").select("id").eq("handle", handle).maybeSingle();
        if (!data) return `Kollektionen "${handle}" hittades inte.`;
      }
      if (!config.limit || Number(config.limit) < 1) return "Antal produkter måste vara minst 1.";
      return null;
    }
    case "text": {
      if (!config.text) return "Text krävs.";
      return null;
    }
    case "collection_links": {
      const handles = config.handles;
      if (!Array.isArray(handles) || handles.length === 0) return "Minst en kollektion krävs.";
      const { data } = await supabaseService.from("collections").select("handle").in("handle", handles as string[]);
      const found = new Set((data ?? []).map((c) => c.handle));
      const missing = (handles as string[]).filter((h) => !found.has(h));
      if (missing.length > 0) return `Kollektionerna hittades inte: ${missing.join(", ")}`;
      return null;
    }
    case "featured_product": {
      const handle = String(config.handle ?? "");
      if (!handle) return "Produkt krävs.";
      const { data } = await supabaseService.from("products").select("id").eq("handle", handle).maybeSingle();
      if (!data) return `Produkten "${handle}" hittades inte.`;
      return null;
    }
    case "comparison_slider": {
      if (!config.beforeImage || !config.afterImage) return "Båda bilderna krävs.";
      return null;
    }
    default:
      return null;
  }
}

export async function reorderSections(page: string, orderedIds: string[], actorId: string): Promise<SaveResult> {
  const { sections } = await getLayout(page, "draft");
  const byId = new Map(sections.map((s) => [s.id, s]));
  if (orderedIds.length !== sections.length || orderedIds.some((id) => !byId.has(id))) return { ok: false, error: "Ogiltig ordning." };
  await saveDraftSections(page, orderedIds.map((id) => byId.get(id)!), actorId);
  return { ok: true };
}

export async function setSectionVisible(page: string, sectionId: string, visible: boolean, actorId: string): Promise<SaveResult> {
  const { sections } = await getLayout(page, "draft");
  const next = sections.map((s) => (s.id === sectionId ? { ...s, visible } : s));
  await saveDraftSections(page, next, actorId);
  return { ok: true };
}

export async function updateSectionConfig(page: string, sectionId: string, config: Record<string, unknown>, actorId: string): Promise<SaveResult> {
  const { sections } = await getLayout(page, "draft");
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return { ok: false, error: "Sektionen hittades inte." };

  const error = await validateConfig(section.type, config);
  if (error) return { ok: false, error };

  const next = sections.map((s) => (s.id === sectionId ? { ...s, config } : s));
  await saveDraftSections(page, next, actorId);
  return { ok: true };
}

export async function addSection(page: string, type: SectionType, afterSectionId: string | null, actorId: string): Promise<{ ok: true; section: Section } | { ok: false; error: string }> {
  const { sections } = await getLayout(page, "draft");
  const newSection: Section = { id: crypto.randomUUID(), type, visible: false, config: { ...DEFAULT_CONFIG[type] } };

  const insertAt = afterSectionId ? sections.findIndex((s) => s.id === afterSectionId) + 1 : sections.length;
  const next = [...sections.slice(0, insertAt), newSection, ...sections.slice(insertAt)];
  await saveDraftSections(page, next, actorId);
  return { ok: true, section: newSection };
}

export async function deleteSection(page: string, sectionId: string, actorId: string): Promise<SaveResult> {
  const { sections } = await getLayout(page, "draft");
  const next = sections.filter((s) => s.id !== sectionId);
  await saveDraftSections(page, next, actorId);
  return { ok: true };
}

export async function publishHomeLayout(page: string, note: string | null, actorId: string): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const { sections: draftSections } = await getLayout(page, "draft");

  const { data: latest } = await supabaseService.from("storefront_layout_versions").select("version").eq("page", page).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const { error: publishError } = await supabaseService
    .from("storefront_layouts")
    .update({ sections: draftSections, updated_at: new Date().toISOString(), updated_by: actorId })
    .eq("page", page)
    .eq("status", "published");
  if (publishError) return { ok: false, error: publishError.message };

  const { error: versionError } = await supabaseService
    .from("storefront_layout_versions")
    .insert({ page, version: nextVersion, sections: draftSections, note: note?.trim() || null, published_by: actorId });
  if (versionError) return { ok: false, error: versionError.message };

  return { ok: true, version: nextVersion };
}

export async function discardDraft(page: string, actorId: string): Promise<SaveResult> {
  const { sections: publishedSections } = await getLayout(page, "published");
  await saveDraftSections(page, publishedSections, actorId);
  return { ok: true };
}

export async function listVersions(page = "home"): Promise<LayoutVersion[]> {
  const { data } = await supabaseService
    .from("storefront_layout_versions")
    .select("version, note, sections, published_at")
    .eq("page", page)
    .order("version", { ascending: false });
  return (data ?? []).map((v: any) => ({
    version: v.version,
    note: v.note,
    publishedAt: v.published_at,
    sectionCount: Array.isArray(v.sections) ? v.sections.length : 0,
  }));
}

export async function getVersionSections(page: string, version: number): Promise<Section[] | null> {
  const { data } = await supabaseService.from("storefront_layout_versions").select("sections").eq("page", page).eq("version", version).maybeSingle();
  return (data?.sections as Section[] | undefined) ?? null;
}

export async function restoreVersionToDraft(page: string, version: number, actorId: string): Promise<SaveResult> {
  const sections = await getVersionSections(page, version);
  if (!sections) return { ok: false, error: "Versionen hittades inte." };
  await saveDraftSections(page, sections, actorId);
  return { ok: true };
}
