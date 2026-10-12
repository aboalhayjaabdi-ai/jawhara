# Phase 4 verification report — content management

Date: 2026-10-12. Branch: `claude/festive-pasteur-77mezq`.

## Scope

Fourth of the admin-completion phases: migrates `lib/pages-content.ts`'s 7 hardcoded info/policy
pages (Om oss, Köpvillkor, Integritetspolicy, Ringstorlek, Startsida, Vanliga frågor, Kontakta oss)
into a real, admin-editable database table, with a working editor UI at `/admin/content` for each
of the three content shapes (plain HTML, FAQ, contact-page text). Every standing constraint was
preserved: the live Shopify store was never touched, the production domain/DNS was never touched,
and `app/api/checkout/route.ts`, `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts`'s
calculation logic are confirmed byte-for-byte unchanged (see **Diff review** below).

## 1. Database migrations

**`0025_phase4_content_pages.sql`** — new `content_pages` table (`handle` unique, `type` one of
`html`/`faq`/`contact`, `title`, and type-specific nullable columns: `body_html`, `faq_items`
jsonb, `contact_intro`, `contact_email_note`), public-read + admin-write RLS, matching every other
content table's pattern in this project.

**`0026_phase4_content_pages_seed.sql`** — seeds the real 7 rows. To guarantee byte-for-byte
fidelity on long legal/policy text (no risk of a manual retyping error silently corrupting the
Köpvillkor or Integritetspolicy text), this file was *generated* directly from the real
`lib/pages-content.ts` object by a disposable script, then applied and verified against the
original object field-by-field before that script was deleted — not hand-typed. A verification
pass confirmed exact equality for every field across all 7 pages (the one apparent FAQ-items
"mismatch" found during that check was traced to Postgres's `jsonb` column normalizing object key
order alphabetically on storage — the content itself is identical, confirmed by direct inspection).

## 2. Read path: `lib/pages-content.ts` is now DB-backed

`getPageContent(handle)` and the new `getAllPageHandles()` (replacing the old `Object.keys(PAGES)`
used by `app/sitemap.ts`) now query `content_pages` via the existing public anon client, same
pattern as every other storefront read. Both functions are now `async` — the two call sites
(`app/(storefront)/pages/[handle]/page.tsx`, `app/sitemap.ts`) were updated to `await` them.

**Real bug found and fixed during verification**: `/pages/[handle]/page.tsx` had no revalidation
directive at all. With a static hardcoded object this never mattered, but once the content became
DB-backed, Next.js would statically cache the rendered page indefinitely (no dynamic API is
otherwise called on that route), so an admin's save would never become visible without a full
rebuild. Fixed by adding `export const revalidate = 60`, the same convention already used by every
other DB-backed storefront page in this project (e.g. `products/[handle]`) — combined with the
admin actions' existing `revalidatePath()` calls, edits now show up immediately in practice, with
the 60s window only ever mattering for a write made completely outside the admin UI (e.g. direct
SQL), which is not the real-world editing path.

## 3. Admin UI (`/admin/content`)

A list page shows all 7 real pages (title, type, URL, last-changed date). Each links to a
type-specific editor:
- **HTML pages** (Om oss, Köpvillkor, Integritetspolicy, Ringstorlek, Startsida): title field +
  the existing shared `RichTextEditor` (Tiptap, already built in an earlier phase for product
  templates — reused, not rebuilt).
- **FAQ page** (Vanliga frågor): title field + an add/remove/edit list of question-answer pairs.
- **Contact page** (Kontakta oss): title + intro text + the e-mail note shown below the form. The
  contact form's actual fields/submit behavior are untouched — this only edits the surrounding
  copy.

Every save goes through `requireAdmin()` → `supabaseService` write → `logAdminAction()` →
`revalidatePath()`, the same convention as every other admin mutation in this project.
`content_page` was added to the audit-log entity-type filter list.

## 4. Verification performed

- `npx tsc --noEmit` and `npm run build`: clean, including the new `/admin/content` and
  `/admin/content/[id]` routes.
- **Content fidelity check** (direct DB query against the real `lib/pages-content.ts` object,
  before that file was rewritten): all 7 pages matched field-for-field.
- **Live storefront spot-check**: all 7 real `/pages/<handle>` URLs return 200 with their real
  content (verified distinctive real sentences from Om oss, all 5 real FAQ questions, the real
  contact intro text), and `/sitemap.xml` lists all 7 page URLs.
- **Live browser verification** (Playwright, a disposable admin account created via the Supabase
  Auth admin API and fully deleted afterward): login; the content list shows all 7 real pages;
  editing the HTML page (Ringstorlek) through the rich-text editor and confirming the change
  appears on the real storefront page; adding a new FAQ question through the UI and confirming it
  appears on the real storefront page; editing the contact page's intro text and confirming it
  appears on the real storefront page. **10/10 checks confirmed correct** — 9 passed directly
  within the test run; the 10th (confirming the test's own temporary edits were fully restored)
  needed to wait out the 60-second revalidation window before a plain `curl` directly confirmed
  all three pages back to their exact real original content with zero trace of the test's marker
  text, since that restore step wrote directly to the database rather than through the admin UI's
  own `revalidatePath()`-triggering action — a test-harness timing detail, not a product defect
  (the actual admin save path always calls `revalidatePath()` immediately, as the first 9 checks
  already proved).
- A real bug was found and fixed mid-verification in the test harness itself (not the product):
  the test script's global outbound-proxy dispatcher, needed for its own Supabase API calls, was
  also incorrectly routing the script's local `fetch()` calls to `localhost:3000` through that
  same external proxy, which correctly rejected them (403). Fixed by giving local requests their
  own non-proxied `undici` dispatcher.
- **Diff review**: `git diff --stat` against `app/api/checkout/route.ts`,
  `app/api/webhooks/stripe/route.ts`, and `lib/discounts.ts` returns empty — confirmed byte-for-byte
  unchanged. `git status` shows exactly 5 modified pre-existing files
  (`app/(storefront)/pages/[handle]/page.tsx`, `app/sitemap.ts`, `components/admin/admin-nav.ts`,
  `components/admin/audit-log-filter-bar.tsx`, `lib/pages-content.ts`); everything else is new.
- All disposable test data (the test admin account, generator/verification scripts) was deleted
  after use; none of it is part of this commit.

## Known, deliberate scope cuts

No create/delete of content pages — this editor manages the fixed set of 7 real pages tied to the
already-existing `/pages/[handle]` route and sitemap, not an open-ended page builder; adding a
genuinely new static page would also need a routing/navigation decision beyond "edit the text,"
which wasn't asked for here. The contact page's form fields/validation/submit behavior are
unchanged — only the surrounding copy is editable.

## Files touched

6 new files (2 migrations, the `/admin/content` list + `[id]` edit pages + actions, and 3 new form
components) plus 5 modified files (`app/(storefront)/pages/[handle]/page.tsx`, `app/sitemap.ts`,
`components/admin/admin-nav.ts`, `components/admin/audit-log-filter-bar.tsx`,
`lib/pages-content.ts`). Full list available via `git status`.
