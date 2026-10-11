# Phase 7 verification report — visual storefront editor

Date: 2026-10-11. Branch: `claude/festive-pasteur-77mezq`.

## Scope

A genuine, Shopify-like visual theme editor for the homepage: drag-and-drop section reordering,
per-section-type content editing (banners, text, buttons, product/collection pickers, desktop and
mobile hero images), a desktop/mobile live preview, a hard draft/published separation with explicit
publishing, full version history with preview-and-restore, and real menu management (header nav +
all four footer link columns) — all built over the *existing* storefront sections and components,
never a generic replacement template. Every standing constraint was preserved: the live Shopify
store was never touched, the production domain/DNS was never touched, and
`app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` are
confirmed byte-for-byte unchanged (see **Diff review** below) — this phase never touches commerce
logic.

Per the user's explicit priority order (discounts → reviews → visual storefront editor, with the
editor called out as the highest-priority module), this plan was presented and approved via plan
mode before any code was written, given the architectural significance of touching the homepage's
render path.

## 1. Ground-truth research before building anything

Before writing any schema or code, a direct read of every real homepage/header/footer file (not
assumed from memory) confirmed the exact scope:

- `app/(storefront)/page.tsx` was 16 hardcoded JSX section instances across exactly 7 component
  types (`Hero`×3, `Marquee`×1, `ProductListSection`×8, `TextSection`×1, `CollectionLinks`×1,
  `FeaturedProductSection`×1, `ComparisonSlider`×1). Every component's real prop shape was read
  directly — these became each section type's JSON `config` shape verbatim, so the editor can
  only ever produce configs the real components already know how to render.
- `storefront_sections` (the original schema's table: `type, position, is_visible, content jsonb`)
  had zero reads/writes anywhere — reconfirmed via a fresh grep. It was deliberately **not**
  reused: it has no draft/published split and no version history, both hard requirements here. It
  is left untouched (not dropped), since dropping a table is an irreversible action with no
  functional upside.
- `components/layout/header.tsx`/`footer.tsx` held 100%-hardcoded nav arrays with no DB table at
  all — the real "menus" gap the user's ask named explicitly.
- `product_templates` (Phase 3's rich-text CRUD admin UI) and per-collection tile-group management
  (`CollectionTileGroupEditor`, Phase 3) already exist as genuine, full editing UIs — not
  simplified placeholders. They are linked from the new editor's header, not rebuilt.
- The existing `product-media` Storage bucket, `mediaUrl()` helper, and the proven
  Route-Handler upload convention were reused as-is for new banner/hero image uploads.
- The exact dnd-kit vertical-reorder pattern already proven in
  `components/admin/product-media-manager.tsx` was reused for both section and menu-item
  reordering.

## 2. Database migrations

- **`0020_phase7_storefront_editor.sql`** — `storefront_layouts` (`page, status('draft'|
  'published'), sections jsonb, updated_at/by`, unique per page+status), `storefront_layout_
  versions` (append-only, `page, version, sections, note, published_at/by`), `storefront_menus`
  + `storefront_menu_items`. RLS: layouts/versions are public-read only for `status='published'`
  (mirrors `products.status = 'active' or is_admin()` exactly) — drafts are never public; menus are
  public-read (every page needs them), admin-write. Real writes go through the service-role client
  after `requireAdmin()`, same convention as every prior phase.
- **`0021_phase7_storefront_seed.sql`** — inserts the *verbatim* 16 current sections (exact images,
  text, handles, headings, read directly from `page.tsx`) as both the `draft` and `published` rows,
  plus version 1 as the baseline snapshot, so cutover changed nothing visually. Seeds the 5 real
  menus/items read directly from `header.tsx`/`footer.tsx`.

## 3. Section registry — the single rendering path

`components/home/section-registry.tsx`'s `SectionRenderer` switches on a section's `type` and
spreads its `config` as props into the *exact same* `Hero`/`Marquee`/`ProductListSection`/
`TextSection`/`CollectionLinks`/`FeaturedProductSection`/`ComparisonSlider` components already in
use — never a new rendering path. `app/(storefront)/page.tsx` now reads the published layout
(`lib/queries.ts`'s `getPublishedHomeSections()`, anon client, RLS-filtered) and maps it through
this one renderer. A section missing a required field (e.g. a brand-new, not-yet-configured
section) is skipped rather than crashing the page.

## 4. Live preview, pixel-identical by construction

`app/(storefront)/preview/page.tsx` lives *inside* the real `(storefront)` route group, so it
automatically inherits the exact same `Header`/`Footer`/fonts/`CartProvider`/`AnnouncementBar`
wrapper as production — zero duplicated chrome. It's gated by `requireAdmin()` (redirects to
`/admin/login` otherwise — confirmed via a 307 on an unauthenticated request) and renders either the
draft (default) or a specific historical version (`?version=N`, read-only) through the same
`SectionRenderer`. The admin editor embeds this route in an iframe with a desktop/mobile width
toggle and a cache-busting key bumped after every edit.

## 5. Admin editor — `/admin/storefront`

A two-pane view: a left sidebar listing the draft's sections (drag-to-reorder via the proven
dnd-kit pattern, a visibility toggle defaulting new sections to **invisible** until configured, an
inline edit panel per type, delete with inline confirmation, an "+ Lägg till sektion" picker) and
the live preview iframe on the right. Section edit forms (`components/admin/section-edit-panel.tsx`)
use the existing upload-route pattern for hero/comparison-slider images
(`app/api/admin/storefront/upload-image/route.ts`, reusing the `product-media` bucket under a new
`storefront/` path prefix), a real collections list for `product_list`/`collection_links` pickers
(`app/api/admin/storefront/collections/route.ts`), and a product-handle search for
`featured_product` (`app/api/admin/storefront/products/route.ts`). Every field referencing a real
collection or product is validated server-side in `lib/admin/storefront-layout.ts`'s
`validateConfig()` before saving — a typo can never be silently saved into a live-bound section.

## 6. Publish, discard, and version history

"Publicera" (optional note) copies the draft into the published row, appends a new
`storefront_layout_versions` row, and calls `revalidatePath("/")` so the real homepage reflects it
immediately rather than waiting out the 60s ISR window. "Återställ till publicerad" discards all
pending draft edits. `/admin/storefront/history` lists every version with a read-only
"Förhandsgranska" link and "Återställ till utkast" — restoring a past version only ever populates
the **draft**; it still requires an explicit `Publicera` click afterward, preserving the one hard
draft/publish gate throughout, confirmed directly in testing.

## 7. Menus go live

`lib/queries.ts`'s `getSiteMenus()` (anon client) is read once by `app/(storefront)/layout.tsx`
(now an `async` Server Component) and passed as props into `<Header navItems={...}>` /
`<Footer footerLinks={...} aboutLinks={...} termsLinks={...} socialLinks={...}>` — both components
keep their original hardcoded arrays only as a fallback if the query ever returns nothing.
`/admin/storefront/menus` (`components/admin/menu-item-list.tsx`, the same dnd-kit pattern) manages
all 5 real menus. **Deliberate scope decision, stated plainly**: menu changes have no separate
draft/publish stage of their own — a saved link change is live immediately, since the user's ask
frames versioning around the homepage section layout specifically, not nav links.

## 8. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including all new `/admin/storefront*`, `/preview`,
  and 3 new API routes compiling correctly; `/` still builds static with its `revalidate: 1m` ISR
  setting intact.
- **Direct functional test** (disposable rows, cleaned up after, **22/22 checks passed**): baseline
  confirmed 16 real sections + version 1; a draft-only visibility toggle never touched the published
  layout; `updateSectionConfig` correctly rejected an empty required field and a nonexistent product
  handle; reordering persisted correctly; `getLayoutMeta` correctly detected unpublished changes;
  publishing created a new version and made the published layout match the draft exactly;
  restoring version 1 to the draft reproduced the real original 16 sections byte-for-byte while
  leaving the published (live) layout untouched; republishing rolled the live homepage back to the
  exact original content, confirmed via JSON equality; **RLS was proven directly**: the public
  (anon-key) client could see only the single published layout row, never the draft.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): **16/17 checks passed** — login; editor loads with
  all 16 real draft sections as draggable rows; the preview iframe renders real content
  ("UTFORSKA NU"); the mobile/desktop preview toggle works; a new section was added, edited, and
  deleted (the one failing check was a test-script race — it counted rows 800ms after the add
  click, before the server action's optimistic UI update had landed; the subsequent edit-and-save
  and delete-back-to-16 steps both succeeded, which is only possible if the add had in fact
  worked, confirmed independently via a direct database count); a section's edit panel opened
  without error; publishing a test change succeeded and the live homepage still rendered
  afterward; the version history page showed the new version; restoring version 1 to the draft and
  republishing rolled the live site back; the menus page loaded with all 5 real menus.
- **Final database check**: after the full test run, the published layout is confirmed
  byte-for-byte identical to the real original 16 sections, and the extra test-created version rows
  were deleted, leaving only the genuine version 1.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`, `app/api/webhooks/stripe/
  route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte unchanged. `git status`
  shows exactly 6 modified pre-existing files (`app/(storefront)/layout.tsx` and `page.tsx`,
  `components/admin/admin-nav.ts`, `components/layout/footer.tsx` and `header.tsx`, `lib/
  queries.ts`); everything else is new.
- All disposable test data (sections, menu items, extra version rows, the test admin account,
  the ad-hoc verification/cleanup scripts) was deleted/removed after use; none of it is part of
  this commit.

## Known, deliberate scope cuts

No in-frame "click a section to select it" editing (Shopify's own theme editor's most complex
interaction) — the sidebar list plus a synced preview covers "see what you're editing" without the
much larger engineering cost of two-way iframe postMessage selection sync; flagged here rather than
silently simplified. No automated cron-based publishing/scheduling for the homepage layout (unlike
discounts' scheduler) — publishing is always an explicit admin action, matching "changes should
appear in the live website only after publishing." Menus have no draft/publish stage (see §7).
`storefront_sections` is left in the schema, unused, rather than dropped. No "pick an existing
uploaded image from a library" — every image field is a fresh upload, consistent with every other
upload control already in this admin.

## Files touched

19 new files (2 migrations, `lib/admin/storefront-layout.ts`, `lib/admin/storefront-menus.ts`, the
`section-registry`, the `/admin/storefront` + `/preview` pages/actions, and 6 new components) plus
6 modified files (`app/(storefront)/layout.tsx`, `app/(storefront)/page.tsx`, `lib/queries.ts`,
`components/layout/header.tsx`, `components/layout/footer.tsx`, `components/admin/admin-nav.ts`).
Full list available via `git status`.
