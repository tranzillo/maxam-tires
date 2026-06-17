# Plan — Close the product-specs Notion loop

> Status: **PROPOSED (awaiting buy-in)** — 2026-06-17. No Notion writes until approved.
> Closes the open loop in CLAUDE.md "Known issues": product specs are built from a
> frozen WP export (`build-product-specs.ts`), so editing specs in Notion does
> nothing. This makes specs flow from Notion like all other editorial content
> (decision #3).

## What we learned (the facts that shape the design)

1. **117 of 117 products have a spec table.** Source today: TablePress tables in
   the WP export (`scripts/output/tires-<lang>.json` → `specTable {headers, rows}`).
2. **Spec *values* are language-invariant.** `155D`, `TL`, `AG16.00`, `500/60R22.5`
   are byte-identical across all 10 languages. Verified en/de/ja/ar-ae.
3. **Only the ~13 column *headers* are translated.** `S.W.` → `PB` (de) →
   `SW（断面幅）` (ja) → `عَرْض القطاع` (ar-ae).
4. **`build-product-specs.ts` does real normalization** — three layouts
   (`colspan`, `paired`, `single`), imperial/metric pair-merging, unit-row
   detection, embedded-unit extraction. This logic is hard-won (bugs already
   fixed in-comment). We do NOT want to re-implement it in the sync reader.
5. The runtime shape `data.ts` consumes (`ProductSpecs {headers, units, variants}`)
   must not change — only its *source* changes (build script → Notion sync).

## Findings from the real data (2026-06-17, step-2 investigation)

Before generating header maps, I audited all 117 products × 10 languages. Three
facts revise the original assumptions:

1. **42 distinct header sets**, not one canonical ~13. Headers vary by product
   family (some have `Tread Compound`, `Number of lugs`; some use `SIZE/LI/SR/PR`
   shorthand). Union of distinct English headers = **60**. The source is also
   internally inconsistent (`S.W` vs `S.W.`, `L.C.C` vs `L.C.C.`).
2. **A flat per-language header map is LOSSY.** 18 English headers map to multiple
   target strings in de — almost always `["Größe", "Size"]`: the translation *plus*
   an untranslated-English fallback (some products were never header-translated).
   A few are genuinely two columns sharing an English label (two `Rim` columns).
   → Headers must be stored **per-product, per-language** (small arrays, 1,168
   total), NOT collapsed into a shared map. Lossless and exact.
3. **The "language-invariant values" claim holds — and the 17% that "diverges"
   is WP source CORRUPTION, not real data.** Value-only comparison: 83% of
   product×language pairs are byte-identical to English; the diverging 17% have
   the SAME row/column counts but stray garbage — e.g. `flotxtra` fr Gross Flat
   Plate = `"okay / 1426"` where en = `"221 / 1426"`. `okay` is a data-entry
   error. **Storing one canonical English value grid and reusing it for every
   language FIXES these bugs** instead of faithfully preserving garbage.

**Net effect on the plan:** the one-value-grid model is *more* justified (it
launders WP corruption). The header map changes from flat-per-language to
**per-product-per-language arrays**. See revised decisions below.

## Design decisions (locked with the user 2026-06-17)

- **Storage:** one native Notion **table block per Product page** holding the
  value grid (one row per size). Reuses the `tableBlock()` writer + read-shape
  normalizer proven in the `[table content omitted]` fix.
- **Headers:** ~~a per-language header map keyed by English header~~ **REVISED →**
  per-product, per-language header arrays (`spec-headers.<lang>.json` =
  `{ "<slug>": ["Größe","Typ",…] }`). A flat keyed map proved lossy (finding #2).
  ~1,168 short arrays total; values still stored once.
- **Normalize at SEED, store clean.** Seed Notion from the *already-normalized*
  `product-specs.en.json` variants, not the raw TablePress grid. The Notion table
  is then a clean `size + field-columns` grid, and the sync reader is trivial
  (no colspan/paired/single logic). The three normalizers stay in the retired
  one-time script as historical record; they never run at sync time.
- **Values canonicalize on English** (user, 2026-06-17). The English value grid is
  the single source of truth for spec values across ALL languages. This
  intentionally discards the ~17% non-English value divergence, which the audit
  showed is WP source corruption (`"okay / 1426"`), not real per-language data.
  Only headers are per-language.

## The shape stored in Notion (per product)

A table block whose first row is the English headers and each subsequent row is
one variant:

```
| Size        | LI/SS | Type | Rim (Rec.) | S.W.    | O.D.    | ... |
| 500/60R22.5 | 155D  | TL   | AG16.00    | 19.7/500| 40.9/1038| ... |
| 600/65R28   | 160D  | TL   | DW20A      | 23.6/600| 46.5/1182| ... |
```

- Values are pre-merged imperial/metric (`19.7 / 500`) — exactly the `field.value`
  strings already in `product-specs.en.json`. No unit rows; units live in the
  header map alongside labels.
- One table = one product. ~117 tables total. ~24 rows each. Well within Notion
  block limits.

## Pipeline changes

### New: `scripts/seed-product-specs-to-notion.ts` (one-time, idempotent)
For each product in `product-specs.en.json`:
- find its Notion Product page (by slug/trid via the existing id maps),
- build a table block from `{headers, variants}` using `tableBlock()`,
- if the page already has a spec table block, archive it first (idempotent re-run),
- append the table block under a stable heading (e.g. "Specifications").
Dry-run flag; processes one product first for verification, then all 117.

### New: `spec-headers.<lang>.json` generator (one-time)
Extract the translated header arrays already present in each
`product-specs.<lang>.json` into a flat `{ "<en-header>": "<localized>" }` map
per language. ~13 keys × 10 langs. These become the canonical header source.

### Changed: `sync-from-notion.ts`
Add a spec reader: for each Product page, read its spec table block →
reconstruct `{headers, units, variants}`:
- `variants` from the table rows (values, language-invariant),
- `headers`/`units` from `spec-headers.<lang>.json` for the target language.
Write `product-specs.<lang>.json` exactly as today.

### Retired: `build-product-specs.ts`
Once sync produces byte-identical `product-specs.*.json`, drop it from the
pipeline. Keep the file (with a RETIRED banner) as the record of the WP-table
normalization logic.

## Verification gate (must pass before flipping the source)

The migration is only "done" when **sync output == current build-script output,
byte-for-byte**, for all 117 products × 10 languages. Concretely:
1. Seed Notion.
2. Run the new sync reader to a *temp* location.
3. `diff` temp vs the committed `product-specs.*.json`. Zero diff = safe to flip.
4. Build; spot-check product pages render identical spec viewers + size selectors.

Until step 3 is clean, `data.ts` keeps reading the build-script output. No user-
facing change happens until parity is proven.

## Sequencing (user chose: plan doc first, then build)

1. **This doc** → review. ← we are here
2. Generate `spec-headers.<lang>.json`; verify it round-trips the current headers.
3. Build the seed script; **seed ONE product**; verify its Notion table.
4. Build the sync reader; produce one product's specs from Notion; diff vs current.
5. Seed all 117; full sync to temp; full byte-diff gate.
6. Flip `data.ts` source / sync output path; retire build script; build + verify.
7. Update CLAUDE.md (close the open loop).

## Parity-gate results (2026-06-17, all 117 seeded + read back)

Seeded all 117 English spec tables; ran the reader (`sync-product-specs.ts`) to a
temp dir; diffed vs the committed (build-script) `product-specs.*.json`. Two
seed/reader bugs were caught and fixed HERE, before any source flip:

- **Duplicate-header collision (seed):** products with two `Infl. P.` / two
  `L.C.C.` columns (different load ratings) collapsed to one value via a
  `label→value` map. Fixed: align fields to columns FIFO-by-label. (23 → 1.)
- **Leading-space trim (reader):** values like `" / 700"` (empty imperial /
  metric 700) lost their leading space. Partly a reader `.trim()` (fixed) and
  partly Notion stripping leading whitespace in table cells at write time
  (unavoidable) — a benign normalization.

**Remaining differences, all explained:**
- **English: byte-identical except ~10 whitespace-normalization cases.** ✓
- **165 value diffs across languages = exactly the WP-corruption fixes** the
  audit predicted (canonicalizing on English). Intended. ✓
- **~114 whitespace-only diffs** (the `" / 700"` pattern). Benign.
- **Keying-model difference:** committed files are keyed by per-LOCALE WPML slug
  (incl. `-2` collision slugs); the new files are keyed by canonical/English
  slug. This is *more correct* (locale-stable, matches the `urlSlug` decision #6)
  but means `data.ts getProductSpecs` must look specs up by canonical slug, not
  `row.slug`. **This is the one load-bearing change required to flip the source.**

**Verdict:** the loop works end-to-end. Flipping requires (a) a `data.ts` keying
change and (b) accepting two documented benign diffs (whitespace, English-value
canonicalization). Checkpoint with the user before flipping (work-style rule #9).

## Risks / open questions

- **Slug/page matching:** seed must reliably map `product-specs` keys (slugs) →
  Notion Product page ids. The existing `notion-*-map.json` should cover this;
  confirm in step 3.
- **Editor ergonomics:** editors edit the value grid in Notion; headers (rare
  edits) live in JSON. If headers must also be editable in Notion later, that's a
  follow-up (small "Spec Headers" DB) — out of scope here.
- **Non-conforming tables:** any product whose current specs the build script
  *dropped* (returned null) simply has no table block — same as today.
