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
  tax map) → import products → link siblings → `build-product-specs` →
  `seed-pages-translations` (homepage) → `sync --only-lang=<lang>` (blocks) → build.
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
| `npx tsx scripts/build-product-specs.ts` | Regenerate product-specs (see open loop) |

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

- **Product specs don't flow from Notion**: `product-specs.*.json` is built by
  `build-product-specs.ts` from the frozen WP export (`scripts/output/tires-*.json`).
  Editing specs in Notion changes nothing. Fix = a structured Specs Notion DB.
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
- **`[table content omitted]` in ~36 resource articles.** The WP→Notion HTML
  converter (`scripts/html-to-notion.ts:276`) substitutes that literal text when
  it hits a `<table>` it can't convert — so those articles lost their tables on
  import, and the placeholder is now baked into the block sidecars. Fix: teach
  the converter to emit a real Notion table block, then re-import + re-sync the
  affected English articles. (Resources are English-only, so en only.)
- **`/sustainability` dead-end CTA** on the homepage (page not built). Events sync
  but have no route.
- **Images**: ~900 product/article images hotlink the live maxamtire.com —
  re-host before launch.
- **The "three half-finished migrations" cluster is CLOSED** (2026-06-13):
  Tailwind removed (#1), Rubber→semantic rename done (#2), old-gen components +
  design gallery deleted. Styling is now one consistent semantic system.
- **PR not merged**: the `chore/repo-integrity` branch (Session 1) is pushed but
  not merged to `main`.

---

## Reference docs
- `docs/AUDIT-2026-06-13.md` — latest audit (83 findings) + recommended sequence.
  Findings JSON alongside. `docs/AUDIT-2026-06-10.md` — prior audit (context).
- `docs/LANGUAGE-PARITY-PLAN.md` — the multi-language model, runbook, pipeline gaps.
- `docs/wp-page-parity.md` — WP page-by-page content parity spec (ignore its
  `Rubber*` naming per decision #2 — banner in the file).
- `docs/archive/` — superseded March-era plans. Historical only.
