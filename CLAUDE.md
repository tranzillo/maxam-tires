# MAXAM Tires — Astro Rebuild

> **This is the contract document.** It records the standing decisions and the real
> architecture. It overrides every other doc when they disagree.
> **Maintenance rule: when a decision is made in a session, record it here in that
> same session.** This file going stale is how the project previously drifted —
> see `docs/AUDIT-2026-06-10.md` for what that cost.

Rebuild of maxamtire.com: WordPress (ACF Pro, WPML, 47 plugins) → **Astro 6 SSG +
Notion CMS + custom central CSS + Netlify**. Three locales: `en`, `ar-ae` (RTL
Arabic), `zh-hant` (Traditional Chinese). ~1050 static pages; the build is fully
offline (no API calls). Content stays consistent with WP; the design is a
modernized system, **not** a clone of the WP look. The WP install
(`C:\Users\kappa\Local Sites\site-maxam-live-...`) is reference material only.

---

## CURRENT PRIORITY (set 2026-06-10)

**Prototype sprint.** Goal: an internally publishable prototype that looks and
feels like the final product. The user leads a page-by-page walkthrough
(homepage → resources → product → industry) and points out design / UX /
structure changes. Implement exactly those — styling and HTML structure changes
in the existing central CSS + components.

**During the sprint, do NOT refactor.** No Tailwind removal, no Rubber renames,
no slug/i18n overhauls, no pipeline changes — unless the user explicitly asks.
Opportunistic fixes only when already on the affected page.

After the prototype ships internally: execute the recovery phases in
`docs/AUDIT-2026-06-10.md` (repo integrity → slug identity → Tailwind removal →
rename pass → close content loops).

---

## Standing decisions (chronological decisions override older docs)

1. **No Tailwind.** Styling = semantic class names + central CSS files.
   *Current state:* Tailwind is still installed and load-bearing (the `@theme`
   token block in `global.css` and ~26 files with utility classes are legacy).
   Do not ADD new utility classes anywhere; new styling goes in
   `src/styles/components/*.css` or `src/styles/pages/*.css`. Full removal is a
   planned recovery phase — don't do it piecemeal.
2. **No `Rubber*` / `rubber-` naming** for any new component, class, or file.
   The 17 existing `Rubber*` components and `.rubber-*` selectors are legacy
   pending a mechanical rename phase. Don't extend the pattern; don't rename
   ad-hoc mid-task either.
3. **All editorial content flows from Notion** via `npm run sync` →
   `src/data/notion-content/*.json` snapshots → `src/lib/data.ts` → pages.
   Files in `scripts/output/` are **frozen one-time WP migration artifacts** —
   never wire them as live sources. *Known open loop:* product specs (see
   Architecture → Known open loops).
4. **UI chrome strings** (nav labels, buttons, form labels) live in
   `src/data/translations/{en,ar-ae,zh-hant}.json` via `t()`. Sentence-length
   marketing copy belongs in Notion, not translations.
5. **Layout system (one formula, 2026-06-10):** two block kinds only.
   *Container blocks*: content capped at `--container-max` (1280px), centered,
   padded by `--gutter`. *Wide blocks* (header bar, products viewer, industries
   strip, recent-products grid): padded by
   `--page-gutter: min(8vw, var(--content-edge))` — **clamped to the
   container's content edge**, so wide blocks align exactly with container
   blocks until the viewport is wide enough for them to actually be wider.
   Tokens live in `global.css :root`; `--page-gutter`/`--content-edge` are
   valid only as padding on full-width elements. Section vertical rhythm comes
   from `--section-pad-{md,lg,xlg}` (shared by `Section` and wide blocks).
6. **Locale parity:** the three locales must render identical page *structure*.
   Never branch on English text (heading matching etc.) — use structure-based
   logic (block types, positions) or data fields.
7. **Design conduct** (explicit user feedback, repeatedly given):
   - Never insert empty/filler elements to align content — alignment is CSS's job.
   - No sliders/carousels — represent the content statically.
   - One atom per concept: one chip, one button, one card language, one spec
     viewer. Don't re-implement an atom's markup inline.
   - No invented magic numbers — derive sizes from tokens, the layout, or ask.
   - Prefer one clean rule over per-case exceptions.
8. **Work style:** slow, one element at a time. The user decides design
   direction; present options when a real choice exists, don't bulk-decide.
9. **Testimonials are dropped project-wide (2026-06-10).** No testimonial UI
   or content anywhere on the site. (Pipeline/data cleanup deferred to the
   recovery phases — just never render them.)
10. **Homepage product grid = most recent products, one per primary industry**
    (max 10), newest first — recency proxied by `wpId` until Notion carries a
    real date/Featured property (`getRecentProductsByIndustry` in data.ts).
    Renders as an even grid only: 5×2 → 4×2 → 3×2 → 2×2 → 1×3; CSS hides
    trailing items so rows are never ragged.
11. **Industries on the homepage = wide horizontal scroll strip** (CSS
    overflow + scroll-snap, no JS carousel). All 10 industries included.
12. **Control heights are shared tokens** (`--control-h-{sm,md,lg}` in
    global.css): buttons and inputs of the same size always match height —
    pair them by size (e.g. newsletter input `size="lg"` + lg button).
13. **Footer = top-level link parity with the header** (Products, Resources,
    Contact, Dealer Login). No subnav columns.

---

## Architecture (verified 2026-06-10)

### Data flow
```
Notion databases
  └─ npm run sync            (scripts/sync-from-notion.ts; sync:fast skips bodies)
       └─ src/data/notion-content/*.json     (16 snapshot files, committed)
          src/data/notion-content/blocks/    (~1,300 per-page body sidecars,
                                              lazily fs-read at build, NOT imported)
            └─ src/lib/data.ts               (the ONLY runtime read path)
                 └─ src/pages/**             (astro build = fully offline)
```
- `src/lib/notion/{client,fetchers}.ts` are used **only** by sync scripts, never at runtime.
- Notion DB IDs live in `scripts/output/notion-ids.json` (required by sync);
  `NOTION_TOKEN` + `NOTION_PARENT_PAGE_ID` in `.env`.
- Notion DBs: Products, Industries, Applications, Tire Types, Articles, Events,
  Documents, Testimonials, **Pages**, **Page Promos** (last two created
  2026-06-10; sync hard-fails if they're missing/empty — no silent seed fallback).
- `scripts/import-pages-to-notion.ts` is **non-idempotent** (re-run = duplicate rows).

### Commands
| Command | What it does |
|---|---|
| `npm run dev` | Dev server :4321 **with HMR** — use this while editing |
| `npm run preview` | Serves static `dist/` — **no file watching**; don't confuse with dev |
| `npm run build` | ~1050 pages in ~13s |
| `npm run sync` / `sync:fast` | Notion → snapshots (fast skips block bodies) |
| `npx tsx scripts/build-product-specs.ts` | Regenerates product-specs snapshots (see open loop) |

After a sync or specs rebuild, **restart the dev server** (snapshots are read at startup).

### CSS
- Entry: `src/styles/global.css` → imports 26 component + 3 page stylesheets.
  All styling lives there; `.astro` files are pure markup (2 legacy scoped
  `<style>` blocks remain: contact page, Specimen).
- Tokens in the `@theme` block of global.css (colors, surfaces, shadows, radii,
  motion) + `:root` (`--page-gutter`). Naming: BEM-ish
  (`.block__element--modifier`).
- Design language: warm off-white layered surfaces, chamfered top highlights,
  directional shadows, molded/pressed interactive states ("rubbermorphism" —
  the look stays; the *naming* goes per decision #2).

### Routes (`src/pages/[locale]/…`)
`index` (home) · `products/index` (full-bleed viewer: TV-remote filter sidebar +
grid, no pagination) · `products/[industry]/index` (same viewer pre-filtered,
industry filter hidden) · `products/[industry]/[slug]` (tire detail: 2-col hero,
gallery, spec viewer + size selector) · `resources/index` · `resources/[slug]` ·
`contact` · `design` (component gallery, env-gated: `MAXAM_SHOW_DESIGN_GALLERY=1`).
Root `/` redirects to a locale. The dirs `src/pages/{en,ar-ae,zh-hans}/` are
empty scaffold remnants (delete in recovery).

### i18n
`src/lib/i18n.ts`: `t()`, `localePath()`, `getDir()`. RTL via `[dir='rtl']` CSS
rules (legacy `rtl:` Tailwind utilities still in ~12 files). CJK via `:lang(zh)`.
Translation linkage (`trid`/`translationIds`) is synced into snapshots but not
yet consumed by routing (see Known broken).

---

## Known broken / open loops (mapped in docs/AUDIT-2026-06-10.md — don't re-discover, don't casually "fix" mid-sprint)

- **Product specs don't flow from Notion**: `product-specs.*.json` is built from
  the frozen WP export (`scripts/output/tires-*.json`, May 4). Editing specs in
  Notion changes nothing. Fix = a structured Specs Notion DB seeded from the
  normalized JSON (recovery Phase 5).
- **ar-ae / zh-hant industry nav 404s**: industry routes are generated from EN
  slugs while nav links use locale slugs. 5 nav links 404. (Fine for an EN-only
  internal demo.)
- **LanguageSwitcher** blind-swaps the locale prefix → 404s on divergent slugs /
  EN-only articles. No hreflang.
- **Dead-end CTA**: the homepage sustainability strip links to
  `/sustainability`, which doesn't exist yet — the page is planned for the
  final site (along with other unported WP pages; see the parity doc).
  (The `/testimonials` dead link is gone — testimonials were dropped.)
- **Images**: ~900 product/article images hotlink the live maxamtire.com —
  prototype depends on the old site staying up; re-host before real launch.
- **Repo state**: ALL of `scripts/` is gitignored (incl. the live sync pipeline
  + notion-ids.json) and 5 snapshot files imported by `data.ts` are untracked —
  **a fresh clone cannot build**. Everything since 2026-05-04 is uncommitted.
- Contact-page office data is hardcoded in frontmatter (incl. Simplified-Chinese
  strings in the zh-hant locale); featured-product slugs hardcoded on the
  homepage; events sync but have no route.

---

## Reference docs

- `docs/AUDIT-2026-06-10.md` — full verified audit: 128 findings, the five rot
  clusters, the recovery phases. Findings JSON alongside it.
- `docs/wp-page-parity.md` — WP page-by-page content parity spec (~90% accurate;
  ignore its `Rubber*` naming per decision #2 — see banner in the file).
- `docs/archive/` — superseded March-era planning docs (IMPLEMENTATION-PLAN,
  DESIGN-SYSTEM). Historical only; do not follow.
