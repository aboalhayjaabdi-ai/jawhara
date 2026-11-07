// Black Month: homepage section order/content + main-menu item (both admin-editable data in
// Supabase, so they're changed here as data, not hardcoded in components).
//
// Two phases, so nothing goes live before the code that renders it is deployed:
//   --commit   writes the new layout to the (non-public) DRAFT only -- previewable in admin.
//   --publish  publishes that draft (same as the admin "Publicera" button: published row + a new
//              storefront_layout_versions entry, so the previous homepage stays one click away under
//              Jawhara admin -> Butik -> Startsida -> Historik) and adds the menu item.
// - Every pre-existing section is kept (none deleted). Two are repurposed (old "Bästsäljare" ->
//   real-sales "Våra bästsäljare", old "Väskor" -> "Upptäck våra väskor"), the old "Utforska våra
//   kollektioner" text line is hidden because its heading moved into the category section itself.
// - Adds "Black Month" -> /black-month to the main menu right after "Hem" (shown uppercase by the
//   nav styling), so it is always visible on desktop (never pushed into the "MER" overflow).
//
// Idempotent: re-running detects the Black Month section/menu item and does nothing twice.
//
// Usage:
//   npx tsx scripts/supabase/black-month-storefront.ts             # dry run (prints the new order)
//   npx tsx scripts/supabase/black-month-storefront.ts --commit    # write the draft
//   npx tsx scripts/supabase/black-month-storefront.ts --publish   # go live (after deploying the code)
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

config({ path: ".env.local" });
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

const COMMIT = process.argv.includes("--commit");
const PUBLISH = process.argv.includes("--publish");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Section = { id: string; type: string; visible: boolean; config: Record<string, unknown> };

// Existing section ids (from the live layout).
const ID = {
  hero: "12ada0d9-86e4-4cd5-8cd5-471a99f46064",
  oldBestsellers: "6aab82aa-f64a-4a0e-ae49-642b6ddc3005",
  oldBags: "66c814b7-dda6-4b69-87d7-f0135314f463",
  collectionsText: "68f38182-a9ba-4b86-9764-b788fec1285b",
  collectionLinks: "7baca4d4-c0b8-434a-98ab-ea027630dc9b",
};
const BLACK_MONTH_HEADING = "BLACK MONTH – VÅRA BÄSTA ERBJUDANDEN";

function buildLayout(current: Section[]): Section[] {
  const byId = new Map(current.map((s) => [s.id, s]));
  for (const id of Object.values(ID)) if (!byId.has(id)) throw new Error(`Expected section ${id} not found in current layout`);
  const get = (id: string) => byId.get(id)!;

  // 1. Banner -- only the button text/link and the (responsive) height change; images untouched.
  const hero: Section = {
    ...get(ID.hero),
    config: {
      ...get(ID.hero).config,
      buttonText: "SHOPPA BLACK MONTH",
      buttonHref: "/black-month",
      height: "min(75vh, 50vw, 760px)",
      mobileHeight: "min(125vw, 70vh)",
      mobileObjectPosition: "50% 22%",
    },
  };
  // 2. Black Month
  const blackMonth: Section = {
    id: randomUUID(),
    type: "product_list",
    visible: true,
    config: {
      collectionHandle: "black-month",
      heading: BLACK_MONTH_HEADING,
      limit: 8,
      layout: "grid",
      style: "campaign",
      buttonText: "SE ALLA ERBJUDANDEN",
      buttonHref: "/black-month",
    },
  };
  // 3. Våra bästsäljare -- real sales (last 90 days), bags + gift sets, minus anything above.
  const bestsellers: Section = {
    ...get(ID.oldBestsellers),
    visible: true,
    config: { collectionHandle: "vaskor-och-tillbehor", heading: "Våra bästsäljare", limit: 6, layout: "carousel", sort: "best-selling", unique: true, buttonText: "Se alla väskor", buttonHref: "/collections/vaskor-och-tillbehor" },
  };
  // 4. Upptäck våra väskor
  const bags: Section = {
    ...get(ID.oldBags),
    visible: true,
    config: { collectionHandle: "vaskor-och-tillbehor", heading: "Upptäck våra väskor", limit: 6, layout: "grid", unique: true, buttonText: "Se alla väskor", buttonHref: "/collections/vaskor-och-tillbehor" },
  };
  // 5. Shoppa efter kategori (existing categories, existing images)
  const categories: Section = {
    ...get(ID.collectionLinks),
    visible: true,
    config: { heading: "Shoppa efter kategori", handles: ["vaskor-och-tillbehor", "armband", "halsband", "orhangen", "ringar", "gift-sets"] },
  };
  // 6. Smycken att älska -- most-sold jewelry first (ordering only, no "bästsäljare" claim)
  const jewelry: Section = {
    id: randomUUID(),
    type: "product_list",
    visible: true,
    config: { collectionHandle: "alla-smycken", heading: "Smycken att älska", limit: 6, layout: "carousel", sort: "best-selling", unique: true, buttonText: "Shoppa smycken", buttonHref: "/collections/alla-smycken" },
  };
  // 7. Gift Sets
  const giftSets: Section = {
    id: randomUUID(),
    type: "product_list",
    visible: true,
    config: { collectionHandle: "gift-sets", heading: "Gift Sets", limit: 6, layout: "carousel", unique: true, buttonText: "Se alla", buttonHref: "/collections/gift-sets" },
  };

  const placed = new Set([ID.hero, ID.oldBestsellers, ID.oldBags, ID.collectionLinks]);
  const rest = current
    .filter((s) => !placed.has(s.id))
    .map((s) => (s.id === ID.collectionsText ? { ...s, visible: false } : s));

  return [hero, blackMonth, bestsellers, bags, categories, jewelry, giftSets, ...rest];
}

const hasBlackMonth = (sections: Section[]) => sections.some((s) => s.type === "product_list" && (s.config as any).collectionHandle === "black-month");

async function writeDraft() {
  const { data: rows, error } = await sb.from("storefront_layouts").select("status, sections").eq("page", "home");
  if (error) throw error;
  const published = rows!.find((r) => r.status === "published")!;
  const draft = rows!.find((r) => r.status === "draft")!;
  if (hasBlackMonth(draft.sections as Section[])) {
    console.log("= draft already has the Black Month layout -- unchanged");
    return;
  }
  if (JSON.stringify(draft.sections) !== JSON.stringify(published.sections)) {
    throw new Error("The homepage draft has unpublished changes -- refusing to overwrite them. Publish or discard the draft in admin first.");
  }
  const next = buildLayout(published.sections as Section[]);
  console.log("New homepage order:");
  next.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.visible ? "      " : "(dold)"} ${s.type.padEnd(17)} ${(s.config as any).heading ?? (s.config as any).buttonText ?? (s.config as any).text ?? ""}`));
  if (!COMMIT) return;
  const { error: e } = await sb.from("storefront_layouts").update({ sections: next, updated_at: new Date().toISOString() }).eq("page", "home").eq("status", "draft");
  if (e) throw e;
  console.log("✓ draft written (not public yet)");
}

async function publishDraft() {
  const { data: rows, error } = await sb.from("storefront_layouts").select("status, sections").eq("page", "home");
  if (error) throw error;
  const published = rows!.find((r) => r.status === "published")!;
  const draft = rows!.find((r) => r.status === "draft")!;
  if (hasBlackMonth(published.sections as Section[])) {
    console.log("= published homepage already has the Black Month layout -- unchanged");
    return;
  }
  if (!hasBlackMonth(draft.sections as Section[])) throw new Error("Draft has no Black Month layout -- run with --commit first.");

  const { data: latest } = await sb.from("storefront_layout_versions").select("version").eq("page", "home").order("version", { ascending: false }).limit(1).maybeSingle();
  let version = latest?.version ?? 0;
  if (version === 0) {
    // No history yet: record the pre-campaign homepage first so it can be restored from admin.
    version += 1;
    const { error: e0 } = await sb.from("storefront_layout_versions").insert({ page: "home", version, sections: published.sections, note: "Före Black Month" });
    if (e0) throw e0;
  }
  const { error: e1 } = await sb.from("storefront_layouts").update({ sections: draft.sections, updated_at: new Date().toISOString() }).eq("page", "home").eq("status", "published");
  if (e1) throw e1;
  const { error: e2 } = await sb.from("storefront_layout_versions").insert({ page: "home", version: version + 1, sections: draft.sections, note: "Black Month-kampanj" });
  if (e2) throw e2;
  console.log(`✓ homepage published (version ${version + 1})`);
}

async function updateMenu() {
  const { data: menu, error } = await sb.from("storefront_menus").select("id, storefront_menu_items(id, title, href, position)").eq("handle", "main-menu").single();
  if (error) throw error;
  const items = ((menu as any).storefront_menu_items as { id: string; title: string; href: string; position: number }[]).sort((a, b) => a.position - b.position);
  if (items.some((i) => i.href === "/black-month")) {
    console.log("= main menu already has Black Month -- unchanged");
    return;
  }
  const homeIndex = items.findIndex((i) => i.href === "/");
  const insertAt = homeIndex + 1; // right after "Hem" (or first if there is no Hem)
  console.log(`Main menu: insert "Black Month" at position ${insertAt} (after ${homeIndex >= 0 ? items[homeIndex].title : "start"})`);
  if (!PUBLISH) return;

  // Shift following items down (highest first, in case positions are unique-constrained).
  for (const item of [...items.slice(insertAt)].reverse()) {
    const { error: e } = await sb.from("storefront_menu_items").update({ position: item.position + 1 }).eq("id", item.id);
    if (e) throw e;
  }
  const position = insertAt < items.length ? items[insertAt].position : (items.at(-1)?.position ?? -1) + 1;
  const { error: e2 } = await sb.from("storefront_menu_items").insert({ menu_id: (menu as any).id, title: "Black Month", href: "/black-month", position });
  if (e2) throw e2;
  console.log("✓ main menu item added");
}

if (PUBLISH) {
  console.log("PUBLISH -- the homepage and menu change on the live site.");
  await publishDraft();
} else {
  console.log(COMMIT ? "COMMIT -- writing the homepage draft only." : "DRY RUN -- no writes. Pass --commit (draft) or --publish (live).");
  await writeDraft();
}
await updateMenu();
