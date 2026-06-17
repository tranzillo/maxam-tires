# MAXAM Tires — Astro Rebuild

> **This is the contract document.** It records the standing decisions and the
> real architecture, and overrides every other doc when they disagree.
> **Maintenance rule: when a decision is made or the architecture changes in a
> session, update this file in that same session.** This file going stale is how
> the project repeatedly drifted — see `docs/AUDIT-2026-06-10.md` and
> `docs/AUDIT-2026-06-13.md` for what that cost.

Rebuild of maxamtire.com: WordPress (ACF Pro, WPML, 47 plugins) → **Astro 6 SSG
+ Notion CMS + custom central CSS + Netlify**. Content stays consistent with WP;
the design is a modernized system, **not** a clone of the WP look. The build is
fully offline — Astro reads committed JSON snapshots, never the Notion API. The
WP install (`C:\Users\kappa\Local Sites\site-maxam-live-...`, MySQL on port
**10023**) is reference/extraction material only.

---

## CURRENT PRIORITY (set 2026-06-13, after the re-audit)

Follow the recovery sequence in `docs/AUDIT-2026-06-13.md`. **Do not add breadth;
secure and finish what exists.** Order:

1. ✅ **Session 1 — repo integrity (DONE 2026-06-13).** Branch
   `chore/repo-integrity`, pushed to origin. Not yet merged to `main` — open a PR.
2. **Session 2 — this doc.** Make CLAUDE.md current (in progress / done).
3. ✅ **Session 3 — empty locales fixed (DONE 2026-06-13).** Synced
   es/fr/it/ja/pt-pt/ru content into the snapshot: all 10 content languages now
   have 117 products + native homepage Pages + product block bodies. Build
   4467 → 5363 pages; every locale renders 123 product pages + native hero
   (verified). Resources stayed English-only (no dupe regeneration).
4. **Next:** LanguageSwitcher hreflang/trid resolution, `prose-content.css`, the
   Tailwind removal, the Rubber→semantic rename. (Original recovery phases.)
   Also: open the PR for `chore/repo-integrity` and merge to `main`.

**Principle: stop adding breadth. Commit and document what exists, then finish or
fence the language port before any further expansion.**

---

## The locale model (the central architectural concept — 2026-06-13)

Two distinct concepts, defined in `src/types/index.ts` + `src/lib/i18n.ts`:

- **`ContentLanguage` (10):** languages we actually STORE — one set of Notion
  rows + one translation file each. `en, ar-ae, zh-hant, de, es, fr, it, ja,
  pt-pt, ru`.
- **`Locale` (14):** front-end URL prefixes + language-switcher options. The 10
  content languages **plus** 4 regional variants (`en-ca, en-uk, es-mx, fr-ca`)
  that **alias** to a base via `LOCALE_ALIASES`. A `/fr-ca/` visitor gets
  `/fr-ca/…` URLs but sees `fr` content. (Verified: WPML regional variants are
  byte-identical clones — storing them separately would be pure duplication.)

`contentLang(locale)` resolves a front-end locale → its content language. **Every
data accessor resolves this internally**; routes/switcher iterate all 14, content
lookups use the resolved 10. `getLang`/`getDir`/`localeName` cover all 14.

**Canonical URL slugs (2026-06-13):** WPML gives each locale its own slug
(`tbr-de`, `tbr-tires-zh-hant`…). URLs must NOT vary by locale, so `Industry` and
`Tire` carry **`urlSlug`** — the English slug for that translation group, keyed by
`trid` (built in `data.ts` `buildCanonicalMaps`). **All hrefs/routes use
`urlSlug`; `slug` is the per-locale content identity only.** This killed the
`/de/products/tbr-de/` class of broken URLs.

---

## Standing decisions (later decisions override earlier docs)

1. **No Tailwind.** Styling = semantic class names + central CSS.
   *DONE 2026-06-13:* Tailwind is fully removed (no package, no `@import`, no
   utility classes anywhere). Tokens are plain `:root` custom properties.
   Shared primitives: `.heading` scale (`--heading-*`), `prose-content.css`
   (Notion bodies), the `Section`/`--container-max`/`--gutter` container,
   `--reading-max` (long-form), `industryVars()` (lib/style.ts), `.filter-pill`,
   `.pagination`, `.app-shell`. **`global.css` @import rules MUST stay at the
   TOP of the file** (CSS spec; Vite drops imports placed after other rules).
   New styling → `src/styles/**`, never utility classes in markup.
2. **No `Rubber*` / `rubber-` naming.** *DONE 2026-06-13:* the prefix is gone
   everywhere — components are semantic (`Button`, `Chip`, `ProductCard`,
   `SiteHeader`…), CSS classes are semantic (`.btn`, `.product-card`,
   `.site-header`, `.mega-nav`, `.mobile-nav`…). Only `--ease-rubber` (a motion
   token) and "rubbermorphism" design-language comments remain — those are the
   intentional visual vocabulary, not the banned prefix. Don't reintroduce it.
3. **All editorial content flows from Notion** via `npm run sync` →
   `src/data/notion-content/*.json` → `src/lib/data.ts` → pages. `scripts/output/`
   holds **frozen one-time WP-migration artifacts** — never wire them as live
   sources. *Open loop:* product specs (see Known Issues).
4. **UI chrome strings** (nav, buttons, form labels) live in
   `src/data/translations/<lang>.json` via `t()` — one file per content language
   (10 files, 121 keys each, hand-authored, **not regenerable from Notion**).
   Sentence-length marketing copy belongs in Notion, not translations.
5. **Resources are English-only (2026-06-13).** Articles + documents are NOT
   translated per-locale — WP never translated them (verified byte-identical
   English). `data.ts` `RESOURCE_LANG='en'`; every resource accessor reads English
   regardless of locale; the sync drops non-English article/document rows+bodies.
   Products, specs, taxonomies, and homepage (Pages) ARE per-language.
6. **Layout system (one formula):** two block kinds. *Container blocks* — content
   capped at `--container-max` (1280px), centered, padded by `--gutter`. *Wide
   blocks* (header, products viewer, industries strip, recent-products grid) —
   padded by `--page-gutter: min(8vw, var(--content-edge))`, clamped to the
   container's content edge so they align until the viewport is wide enough to be
   wider. Tokens in `global.css :root`. Section rhythm via `--section-pad-*`.
7. **Locale parity:** all locales render identical page *structure*. Never branch
   on translated text — use structure-based logic (block types/positions) or data
   fields + `trid`.
8. **Design conduct** (explicit, repeated user feedback):
   - Never insert empty/filler elements to align content — alignment is CSS's job.
   - No sliders/carousels — represent content statically.
   - One atom per concept (one chip, button, card language, spec viewer); don't
     re-implement an atom's markup inline.
   - No invented magic numbers — derive from tokens/layout, or ask.
   - Prefer one clean rule over per-case exceptions.
9. **Work style:** slow, one element at a time. The user decides design
   direction; present real choices, don't bulk-decide. For large/destructive or
   out-of-sequence work, get explicit buy-in first (the 2026-06-13 audit exists
   because a multi-language port was done out of sequence).
10. **Testimonials dropped project-wide.** No testimonial UI/content anywhere.
11. **Homepage** = hero (Pages content) → promo pair (Page Promos) → industries
    horizontal scroll strip (all 10 industries, CSS scroll-snap, no JS) → recent
    products grid (`getRecentProductsByIndustry`, 1 per primary industry, max 10,
    even grid 5×2→1×3, recency proxied by `wpId`) → sustainability strip →
    resource center → newsletter.
12. **Control heights are shared tokens** (`--control-h-{sm,md,lg}`): inputs and
    buttons of the same size match height — pair by size.
13. **Footer = top-level link parity with the header** (Products, Resources,
    Contact, Dealer Login). No subnav columns.

---

## Architecture

### Data flow
```
Notion databases  ──npm run sync──▶  src/data/notion-content/*.json (committed snapshots)
                  (sync-from-notion.ts)   + blocks/<type>-<lang>-<slug>.json sidecars
                                            (lazily fs-read at build, NOT bundled)
                                              └─▶ src/lib/data.ts (ONLY runtime read path)
                                                    └─▶ src/pages/** (astro build, offline)
```
- `src/lib/notion/{client,fetchers,query}.ts` are used **only** by sync scripts,
  never at runtime. `query.ts` `withRetry` hardens against transient timeouts.
- Notion DB/page IDs + relation maps live in `scripts/output/notion-ids.json` +
  `notion-*-map.json` (tracked). `NOTION_TOKEN` + `NOTION_PARENT_PAGE_ID` in
  `.env` (untracked).
- Notion DBs: Products, Industries, Applications, Tire Types, Articles, Events,
  Documents, Testimonials, Pages, Page Promos. Sync hard-fails if Pages/Promos
  are missing/empty (no silent fallback).

### Multi-language pipeline (per-language; see docs/LANGUAGE-PARITY-PLAN.md)
- `scripts/content-languages.ts` — the 10 `CONTENT_LANGUAGES` + `resolveLanguages`.
  Extract/import scripts take optional language args (default all).
- Per-language runbook: extract → import taxonomies FIRST (idempotent, merges the
  tax map) → import products → link siblings → `seed-pages-translations` (homepage)
  → `sync --only-lang=<lang>` (blocks) → `sync-product-specs` (specs from Notion)
  → build. (Product specs now live in Notion — see "Product specs" below.)
- **Idempotency:** import-products/articles/taxonomies + seed-pages skip existing
  rows (WP-ID/trid + language). `import-pages-to-notion.ts` is the ONE
  non-idempotent importer (re-run duplicates) — use `seed-pages-translations.ts`
  for new languages instead.

### Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server :4321 **with HMR** — use while editing |
| `npm run preview` | Serves static `dist/` — **no watch**; not for editing |
| `npm run build` | Full build (currently ~4,467 pages across 14 locales) |
| `npm run sync` / `sync:fast` | Notion → snapshots (fast skips block bodies) |
| `npm run sync -- --only-lang=de` | Sync block bodies for one language only |
| `npx tsx scripts/sync-product-specs.ts` | Read spec tables from Notion → product-specs.*.json |
| `npx tsx scripts/seed-product-specs-to-notion.ts` | One-time: push clean spec tables INTO Notion |

After a sync or specs rebuild, **restart the dev server** (snapshots read at startup).

### CSS
- Entry `src/styles/global.css` imports 26 component + 3 page stylesheets. All
  styling lives there; `.astro` files are (mostly) pure markup — 2 legacy scoped
  `<style>` blocks remain (contact page, Specimen).
- Tokens in the `@theme` block (colors/surfaces/shadows/radii/motion) + `:root`
  (`--gutter`, `--content-edge`, `--page-gutter`, `--section-pad-*`,
  `--control-h-*`). BEM-ish naming.
- Design language: warm off-white layered surfaces, chamfer highlights,
  directional shadows, molded/pressed states ("rubbermorphism" — the *look*
  stays; the *naming* goes per decision #2).

### Routes (`src/pages/[locale]/…`)
`index` (home) · `products/index` (full-bleed viewer: filter sidebar + grid, no
pagination) · `products/[industry]/index` (same viewer pre-filtered) ·
`products/[industry]/[slug]` (tire detail: 2-col hero, gallery, spec viewer + size
selector) · `resources/index` · `resources/[slug]` · `contact` · `design`
(component gallery, env-gated `MAXAM_SHOW_DESIGN_GALLERY=1`). Root `/` redirects to
a locale.

### i18n (`src/lib/i18n.ts`)
`t`, `localePath`, `getDir`, `getLang`, `localeName`, `contentLang`,
`contentLanguages`, `locales` (14), `LOCALE_ALIASES`. RTL via `[dir='rtl']` CSS
(legacy `rtl:` utilities still in ~12 files). CJK via `:lang(zh)`.

---

## Known issues / open loops (don't re-discover; map in docs/AUDIT-2026-06-13.md)

- **Product specs flow from Notion** — FIXED 2026-06-17 (was the biggest open
  loop). Each English Product page holds a clean spec **table block** (one row per
  size, merged imperial/metric values); `sync-product-specs.ts` reads it and
  writes `product-specs.<lang>.json`. **Spec values canonicalize on English** —
  values are language-invariant, so one grid serves all 10 languages; only the
  ~13 column headers are translated (`spec-headers.<lang>.json`). This also
  laundered ~165 WP source-corruption values (e.g. `"okay / 1426"` → `"221 /
  1426"`). `data.ts getProductSpecs` keys by canonical (English) slug.
  `build-product-specs.ts` (the frozen-WP-export builder) is DELETED. Full
  story: `docs/SPECS-NOTION-MIGRATION.md`. Editors edit specs in Notion now.
- **LanguageSwitcher** — FIXED 2026-06-13. The blind prefix-swap no longer 404s
  (slug normalization + English-only resources made every path identical across
  locales). Switcher now preserves query string + hash on switch; BaseLayout
  emits 14 `hreflang` alternates + x-default. (Switcher still carries Tailwind
  utility classes — deferred to the Tailwind-removal phase.)
- **Simplified Chinese inside the zh-hant (Traditional) locale**: `zh-hant.json`
  contact.* keys + contact page region names use Simplified forms.
- **Contact offices hardcoded** in `contact/index.astro` frontmatter (should be a
  Notion record). **Featured-product** logic and **homepage Pages content** for
  the 6 unsynced languages still incomplete.
- **`/sustainability` page + events routing — FIXED 2026-06-17.** The
  sustainability page is built (`src/pages/[locale]/sustainability.astro`),
  content stored as a Notion **Page block body** (seeded by
  `scripts/seed-sustainability-page.ts`, reinterpreted from the WP ACF page into
  our design system). The homepage CTA now resolves. Events were folded into the
  Resource Center feed (`getAllResources` → `eventToArticle`); the 'event' filter
  now has content, and event cards render non-linking (no detail page). Long-form
  content pages use the new page-block pipeline: `fetchPages` captures a block
  body, `splitBlocks(pages,'page')` writes a `page-<lang>-<slug>.json` sidecar,
  `getPageBlocks` reads it (with **English fallback** for untranslated locales).
  Stat cards are a render convention: a `callout` whose text is `VALUE | LABEL`
  → styled `.prose-stat`. **Still to port (later, by design — they're ACF
  page-builder layouts, NOT clean content):** why-maxam, ecopoint3, privacy-
  policy, warranty, compliance; the tire-pressure calculator needs a rebuild.
  Job postings + category intro copy: skipped by decision.
- **WP↔Notion article divergence — RESOLVED 2026-06-17.** The Notion Articles DB
  had drifted into an incomplete copy: 34 articles missing entirely (the
  table-containing ones, never re-imported after the converter fix) and 16 with
  truncated bodies from an older converter import (e.g. 7 blocks where the current
  converter produces 112). A full `npm run sync` reads Notion only, so it silently
  dropped/truncated those — destructive to articles. **Fixed by realigning Notion
  to the complete WP extract:** `scripts/realign-articles-to-notion.ts` re-imported
  the 50 affected articles (slug-matched, full bodies via the fixed converter;
  missing→create, truncated→archive+recreate). Notion is now 357 en (== snapshot);
  a verified full sync reproduces all 357 with full bodies + intact tables, 0
  dropped/truncated. **A full sync is no longer destructive to articles.** The
  realign script is idempotent — re-run it if the DB ever drifts again.
- **Images**: ~900 product/article images hotlink the live maxamtire.com —
  re-host before launch.
- **The "three half-finished migrations" cluster is CLOSED** (2026-06-13):
  Tailwind removed (#1), Rubber→semantic rename done (#2), old-gen components +
  design gallery deleted. Styling is now one consistent semantic system.
- **`[table content omitted]` is FIXED** (2026-06-15): the converter
  (`scripts/html-to-notion.ts`) now emits real Notion table blocks via
  `tableBlock()` instead of the placeholder. The originally-planned Notion
  re-import was abandoned: the affected articles' sidecars came from an older
  import and 34 of 36 no longer exist in the current Notion Articles DB, so a
  round-trip was impossible. Instead `scripts/regen-article-table-sidecars.ts`
  regenerates the affected `article-en-*.json` sidecars directly from the WP
  extract (`scripts/output/articles-en.json` — the same source the article
  snapshot was built from), normalizing tables to the reader's read-API shape
  (rows at top-level `children`, not `table.children`). Verified: 0 placeholders
  and 476 article dist pages render real `<table>`s. If articles are ever
  re-imported into Notion proper, this regen becomes unnecessary.
- **Recovery work merged to `main`** (2026-06-17): the `chore/repo-integrity`
  branch (35 commits — repo integrity, locale model, slug fix, Tailwind removal,
  Rubber rename, table fix) fast-forwarded into `main` and pushed. New work
  branches from `main`. The recovery sequence from `docs/AUDIT-2026-06-13.md` is
  complete.

---

## Reference docs
- `docs/AUDIT-2026-06-13.md` — latest audit (83 findings) + recommended sequence.
  Findings JSON alongside. `docs/AUDIT-2026-06-10.md` — prior audit (context).
- `docs/LANGUAGE-PARITY-PLAN.md` — the multi-language model, runbook, pipeline gaps.
- `docs/wp-page-parity.md` — WP page-by-page content parity spec (ignore its
  `Rubber*` naming per decision #2 — banner in the file).
- `docs/archive/` — superseded March-era plans. Historical only.
