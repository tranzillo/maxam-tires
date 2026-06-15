# Full Language Parity Plan — WP → Notion (2026-06-13)

Goal: bring the Notion content CMS to full language parity with the WordPress
site (`http://localhost:10022/`, MySQL on port **10023**), beyond the initial
3 languages (en, ar-ae, zh-hant).

## Ground truth (probed from WP `wp_icl_translations`, 2026-06-13)

WPML has **14 active languages**. Content is near-complete in all of them
(~122 tires, 268 news, 121 product-sheets, 27 brochures, 11 events, 7
testimonials, full taxonomies per language).

**Regional variants are byte-identical clones of their base language** (verified:
fr-ca news bodies = fr news bodies exactly; titles + subheadings identical for
fr/fr-ca, es/es-mx, en/en-ca, en/en-uk). WPML cloned, never localized them.

## The locale model (key decision)

Separate **content languages** (stored in Notion) from **front-end locales**
(URL routes + language switcher). Regional variants ALIAS to their base content.

**Content languages — 10** (one set of Notion rows each):
`en`, `ar-ae`, `zh-hant` (done) + `de`, `es`, `fr`, `it`, `ja`, `pt-pt`, `ru` (to port).

**Front-end locales — 14** (routes + switcher), resolved via alias map:
```
en      ← en, en-ca, en-uk
es      ← es, es-mx
fr      ← fr, fr-ca
de ← de   it ← it   ja ← ja   pt-pt ← pt-pt   ru ← ru
ar-ae ← ar-ae   zh-hant ← zh-hant
```
A `fr-ca` visitor gets `/fr-ca/...` URLs and a "Français (Canada)" switcher
entry, but sees `fr` content. (`ar` active=0 is a deprecated dup of ar-ae —
excluded.)

This means: `Locale` type and route generation expand to the 14 front-end
locales; a `LOCALE_ALIASES` map resolves each to its content language; `t()`,
`getProductBySlug()`, etc. look up by the *content* language.

## Decisions (2026-06-13)

- Port distinct base languages only (7 new); regional variants are front-end
  aliases, not stored content.
- **Pilot German (`de`) end-to-end first**, then batch es/fr/it/ja/pt-pt/ru.
- **Add idempotency guards before importing** (skip if WP ID + language already
  in Notion — the `--only-new` pattern import-content-to-notion.ts already has;
  port to import-products and import-articles).
- **Re-extract specs for all 10 content languages** from WP (translated column
  headers), feeding the existing build-product-specs pipeline.
- DB port is **10023** (10022 is the HTTP port; db.ts already correct).

## Phases

**A. Generalize + harden (no new content)**
- Split `Locale` into front-end locales (14) + `CONTENT_LANGUAGES` (10) +
  `LOCALE_ALIASES`; route generation emits all 14, content resolves via alias.
- Add `getDir`/`getLang` entries for the new languages (all LTR; ja = `ja`,
  etc.).
- Idempotency guards on import-products / import-articles (match WP ID + lang).
- Confirm extract scripts parameterize on an arbitrary `language_code`.

**B. Pilot `de` end-to-end**
extract (tires/news/docs/events/testimonials/specs for `de`) → import to
existing Notion DBs → link translations by trid → `npm run sync` → build →
verify `/de/...` renders, switcher works, specs present. Fix generalization
gaps found here before batching.

**C. Batch es/fr/it/ja/pt-pt/ru**
Same sequence in a scripted loop (now idempotent). Wire all 14 front-end locale
aliases; verify switcher + routing on a sample.

**D. Verify parity**
Per-language Notion snapshot counts vs WP; spot-check rendered pages; confirm
regional-alias routes resolve to base content.

## Phase A findings (completed 2026-06-13)

- **WP post IDs are globally unique per language** (verified: one tire trid has
  14 distinct element_ids, 0 collisions). So the existing `--only-new` guard in
  import-products / import-articles (match on WP ID) is already idempotent
  across languages — no new guard code needed.
- **Spec tables DO exist per language in WP.** Each tire's
  `tire_specifications_table` meta points to a distinct table ID per language
  (AGRIXTRA 65: en=87, de=875, fr=872, it=880, ja=879, ru=877…). The earlier
  sparse `post_tablepress_table` WPML count was misleading — the tables aren't
  WPML-linked, but they exist and are referenced directly. So re-extracting
  specs per language (translated headers) works via the existing
  extract-tires → extract-tablepress path, no redesign.
- **DB port is 10023** (10022 is HTTP; db.ts already correct).
- Events are mostly `private`/`draft` in WP (en: 6 published of 35; de: 0
  published of 11) — extractor correctly returns only published. Expected, not
  a bug.

### What Phase A changed
- `src/types/index.ts`: split `ContentLanguage` (10) from `Locale` (14).
- `src/lib/i18n.ts`: `LOCALE_ALIASES`, `contentLang()`, `localeName()`,
  getLang/getDir for all 14; loads 10 translation files.
- `src/lib/data.ts`: every accessor resolves `locale → contentLang` before
  snapshot lookup; spec map keyed by content language (new langs fall back to
  en specs until Phase C generates real ones).
- `src/data/translations/{de,es,fr,it,ja,pt-pt,ru}.json`: en-copy PLACEHOLDERS
  (replaced with real extracts in Phase C).
- LanguageSwitcher + contact page office map updated for the 14-locale model.
- `scripts/content-languages.ts`: shared CONTENT_LANGUAGES + resolveLanguages();
  extract-* drivers take an optional language CLI arg (default all).
- Build: 1050 → **1942 pages**, all 14 locales render, correct BCP-47 lang
  tags + RTL, aliases resolve (de/fr/etc. show en content until imported).

## Phase B findings — German pilot (2026-06-13)

The pilot surfaced **3 generalization gaps** the original 3-language pipeline
hid. All fixed; the batch phase (C) inherits the fixes.

1. **Taxonomy importer was destructive + not language-scoped.**
   `import-taxonomies-to-notion.ts` imported ALL languages from the extract
   file with no `--only-new`, and rebuilt `notion-tax-map.json` from `{}` each
   run — re-running would have duplicated the existing 3 languages' rows and
   wiped the map products depend on. FIXED: now takes a language arg, skips
   terms already in Notion (WP Term ID + language), and MERGES into the
   existing map. **Run taxonomies FIRST for each new language, before products**
   (products resolve industry/application/type relations through that map).

2. **Article sibling map was split across two files.** The original
   en/ar-ae/zh-hant articles wrote `notion-articles-map.json` (plural); the new
   importer writes `notion-article-map.json` (singular). The singular map thus
   had only `de`, so the linker found no siblings (linked 0). FIXED for de by
   merging plural→singular (965 entries; 302 trids now 4-lang). For Phase C:
   the importer merges correctly, so once all languages write to the SINGULAR
   map, linking works — but the original 3 langs' IDs live only in the plural
   map. **Before linking articles in Phase C, merge the plural map into the
   singular one** (or re-import — idempotent). A `.bak` of the singular map is
   at scripts/output/notion-article-map.json.bak.

3. **build-product-specs hardcoded 3 locales.** FIXED: now uses
   CONTENT_LANGUAGES, skips languages whose tires extract is absent.

### German import results (all 0 failures)
117 products, 307 articles, 130 documents, 7 testimonials, 0 events (all
private/draft in WP). 74 taxonomy rows. 117 spec tables with German headers.
Sibling links: products 468, documents 520, testimonials 28, articles (re-run
after map merge).

4. **Full sync (with blocks) doesn't scale to more languages in one pass.**
   The full `npm run sync` fetches every language's block bodies sequentially;
   with 4 languages it hit Notion's request timeout mid-run and aborted. FIXED
   two ways: (a) added retry-with-exponential-backoff to the raw Notion calls
   in src/lib/notion/query.ts (`withRetry`, handles transient
   timeouts/429/5xx); (b) added `--only-lang=de[,fr]` to sync-from-notion.ts +
   `blockLangs` to fetchProducts/fetchArticles, so blocks are fetched for ONE
   language while metadata syncs for all and other languages' sidecars are left
   intact. **Phase C: sync each new language's blocks with
   `--only-lang=LANG`**, not a full re-sync. (`sync:fast` for metadata-only
   stays available.)

### Open question for ALL new languages
The ~121 UI-chrome strings (nav/buttons/labels in
src/data/translations/<lang>.json) are HAND-AUTHORED, not extracted from WP
(extract-translations.ts only does tires). de.json is currently an en-copy
placeholder → German pages render with English nav labels but fully German
CONTENT. Decide per-language: ship en-placeholder chrome, or translate the 121
keys. (Same choice will apply to es/fr/it/ja/pt-pt/ru.)

## Per-language runbook (for Phase C, derived from the pilot)
For each language LANG:
1. `npx tsx scripts/extract-all.ts LANG`            (tires+specs+taxonomies)
2. `npx tsx scripts/extract-articles.ts LANG`
3. `npx tsx scripts/extract-documents.ts LANG`
4. `npx tsx scripts/extract-events.ts LANG`
5. `npx tsx scripts/extract-testimonials.ts LANG`
6. `npx tsx scripts/import-taxonomies-to-notion.ts LANG`   ← FIRST
7. `npx tsx scripts/import-products-to-notion.ts LANG --only-new`
8. `npx tsx scripts/import-articles-to-notion.ts LANG --only-new`
9. `npx tsx scripts/import-content-to-notion.ts documents LANG --only-new`
10. `npx tsx scripts/import-content-to-notion.ts testimonials LANG --only-new`
11. (merge plural→singular article map if needed) then link siblings:
    `link-notion-siblings.ts {products,article,documents,testimonials}`
12. `npx tsx scripts/build-product-specs.ts`  (regenerates all langs)
13. wire product-specs.LANG.json + translations/LANG.json into data.ts/i18n.ts
14. `npm run sync` → build → verify /LANG/

## Status
- [x] Probe WP languages + variant-identity + DB port (2026-06-13)
- [x] Phase A — generalize + harden (2026-06-13)
- [x] Phase B — German pilot COMPLETE (2026-06-13). 117 products + 307 articles
      + 130 docs + 7 testimonials imported, all siblings linked, 117 German
      spec tables, German UI strings (de.json), German blocks synced via
      --only-lang=de. Build 1942→2261 pages; /de/ verified rendering real
      German nav + content + spec headers + bodies end-to-end. 4 pipeline
      gaps found + fixed (see Phase B findings). data.ts wires
      product-specs.de.json.
- [ ] Phase C (batch 6: es, fr, it, ja, pt-pt, ru) — follow the per-language
      runbook; each needs: extract → import(tax first) → link(merge article
      map) → build-specs → wire specs+translations into data.ts/i18n.ts →
      sync --only-lang=LANG → build. Plus decide UI-string strategy per lang.
- [ ] Phase D (verify)
