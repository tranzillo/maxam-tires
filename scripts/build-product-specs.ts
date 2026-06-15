/*
 * build-product-specs.ts — one-time migration: normalize each product's
 * spec table into clean structured data and write it to the snapshot at
 * src/data/notion-content/product-specs.json.
 *
 * Source: scripts/output/tires-<locale>.json (the WP migration output),
 * which carries each product's `specTable` { headers, rows } plus its
 * `tablepressTableId`. This is migration scaffolding — once these clean
 * specs are pushed back into Notion, the live sync path will read them
 * from there instead and this script is retired.
 *
 * The raw specTable shape (per product):
 *   headers: string[]                      column labels (localized)
 *   rows[0], rows[1]: unit rows            e.g. ['', '', 'in', 'mm', ...]
 *                                          — together they tell us which
 *                                          columns are dual-unit measurements
 *   rows[2..]: data rows, in imperial/metric PAIRS
 *                                          (even = imperial, odd = metric;
 *                                          non-measurement columns repeat)
 *
 * We merge each imperial+metric pair into one "variant" where measurement
 * fields hold { imperial, metric } and non-measurement fields hold a single
 * value. Each variant is one selectable row in the UI.
 *
 * Output shape (per locale, per slug):
 *   {
 *     headers: string[],            // column labels (Size dropped to label)
 *     units:   (string|null)[],     // "in / mm" per column, or null
 *     variants: Array<{
 *       size: string,               // column-0 value, the dropdown label
 *       fields: Array<{ label, value, unit }>  // one per non-size column
 *     }>
 *   }
 *
 * Usage: npx tsx scripts/build-product-specs.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CONTENT_LANGUAGES } from './content-languages.js';

// All content languages; each is skipped gracefully if its tires-<lang>.json
// extract isn't present yet (see the existsSync guard in the loop below).
const LOCALES = CONTENT_LANGUAGES;
const OUT_DIR = join(process.cwd(), 'src', 'data', 'notion-content');
const SRC_DIR = join(process.cwd(), 'scripts', 'output');

interface RawSpecTable {
  tableId: string;
  title: string;
  headers: string[];
  rows: string[][];
}

interface RawTire {
  slug: string;
  language: string;
  specTable?: RawSpecTable | null;
}

interface SpecField {
  label: string;
  value: string;
  unit: string | null;
}

interface SpecVariant {
  size: string;
  fields: SpecField[];
}

interface ProductSpecs {
  headers: string[];
  units: (string | null)[];
  variants: SpecVariant[];
}

function clean(s: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

const COLSPAN = '#colspan#';

/**
 * Clean a header label: collapse newlines/whitespace, and pull an
 * embedded unit out of the label (e.g. "Width (mm)" → label "Width",
 * unit "mm"; "Tread Depth\n(mm)" → "Tread Depth", "mm"). Returns the
 * cleaned label plus any extracted unit.
 */
function cleanLabel(raw: string): { label: string; embeddedUnit: string | null } {
  let label = clean(raw);
  let embeddedUnit: string | null = null;
  // Trailing "(...)" that looks like a unit, e.g. (mm), (kg), (lbs/kg).
  const m = label.match(/\s*\(([^)]*(?:mm|cm|in|kg|lbs|psi|kpa|l|gal|°)[^)]*)\)\s*$/i);
  if (m) {
    embeddedUnit = m[1].trim();
    label = label.slice(0, m.index).trim();
  }
  return { label, embeddedUnit };
}

/** Merge a cell that may hold "imp\nmet" (e.g. "31\n68") into "imp / met". */
function mergeCellUnits(cell: string): string {
  const parts = (cell ?? '').split('\n').map((x) => clean(x)).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return parts.join(' / ');
}

/**
 * Detect the table layout:
 *   'colspan'  — has #colspan# headers; metric is the adjacent column,
 *                one data row = one variant.
 *   'paired'   — two unit rows (in / mm); imperial & metric are
 *                consecutive row pairs per size.
 *   'single'   — one value per cell (rubber tracks); one data row =
 *                one variant, units come from the label or unit row.
 */
function detectLayout(table: RawSpecTable): 'colspan' | 'paired' | 'single' {
  if (table.headers.some((h) => (h || '').includes(COLSPAN))) return 'colspan';
  const r0 = table.rows[0] ?? [];
  const r1 = table.rows[1] ?? [];
  for (let i = 0; i < Math.min(r0.length, r1.length); i++) {
    if (/\bin\b/i.test(r0[i] || '') && /\bmm\b/i.test(r1[i] || '')) return 'paired';
  }
  return 'single';
}

/* ── Layout-specific normalizers ─────────────────────────────────── */

// colspan: each #colspan# column is the metric pair of the column before
// it. Collapse them: the labeled column keeps the label; its value
// becomes "labeledValue / colspanValue"; the unit becomes
// "labeledUnit / colspanUnit" (read from the single unit row, row 0).
function normalizeColspan(table: RawSpecTable): ProductSpecs {
  const { headers, rows } = table;
  const unitRow = rows[0] ?? [];

  // Build the merged column list, skipping #colspan# columns (their data
  // folds into the previous real column).
  type Col = { srcIndex: number; label: string; unit: string | null; pairIndex: number | null };
  const cols: Col[] = [];
  for (let i = 0; i < headers.length; i++) {
    if ((headers[i] || '').includes(COLSPAN)) continue;
    const { label, embeddedUnit } = cleanLabel(headers[i] ?? '');
    const pairIndex = (headers[i + 1] || '').includes(COLSPAN) ? i + 1 : null;
    let unit: string | null = embeddedUnit ?? clean(unitRow[i] ?? '') ?? null;
    if (pairIndex !== null) {
      const a = clean(unitRow[i] ?? '');
      const b = clean(unitRow[pairIndex] ?? '');
      unit = a && b ? `${a} / ${b}` : a || b || embeddedUnit || null;
    }
    cols.push({ srcIndex: i, label, unit: unit || null, pairIndex });
  }

  // Data rows: skip unit rows (rows whose first cell — the size — is empty).
  const dataRows = rows.filter((r) => clean(r[0] ?? '') !== '');
  const variants: SpecVariant[] = [];
  for (const r of dataRows) {
    const size = clean(r[cols[0].srcIndex] ?? '');
    if (!size) continue;
    const fields: SpecField[] = [];
    for (let c = 1; c < cols.length; c++) {
      const col = cols[c];
      const a = clean(r[col.srcIndex] ?? '');
      const b = col.pairIndex !== null ? clean(r[col.pairIndex] ?? '') : '';
      const value = b && b !== a ? `${a} / ${b}` : a;
      if (!value || !col.label) continue;
      fields.push({ label: col.label, value, unit: col.unit });
    }
    variants.push({ size, fields });
  }

  return {
    headers: cols.map((c) => c.label),
    units: cols.map((c) => c.unit),
    variants,
  };
}

// paired: two unit rows (imperial / metric). Each size is two consecutive
// data rows (imperial then metric). Merge measurement columns.
function normalizePaired(table: RawSpecTable): ProductSpecs {
  const { headers, rows } = table;
  const impUnit = rows[0] ?? [];
  const metUnit = rows[1] ?? [];

  const cleanedHeaders: string[] = [];
  const units: (string | null)[] = [];
  for (let i = 0; i < headers.length; i++) {
    const { label, embeddedUnit } = cleanLabel(headers[i] ?? '');
    cleanedHeaders.push(label);
    const a = clean(impUnit[i] ?? '');
    const b = clean(metUnit[i] ?? '');
    units.push(a && b && a !== b ? `${a} / ${b}` : a || b || embeddedUnit || null);
  }

  const isMeasure = (col: number) => {
    const a = clean(impUnit[col] ?? '');
    const b = clean(metUnit[col] ?? '');
    return !!a && !!b && a !== b;
  };

  const data = rows.slice(2);
  const variants: SpecVariant[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const imperial = data[i];
    const metric = data[i + 1];
    const size = clean(imperial[0] ?? '');
    if (!size) continue;
    const fields: SpecField[] = [];
    for (let col = 1; col < headers.length; col++) {
      if (!cleanedHeaders[col]) continue;
      const impVal = clean(imperial[col] ?? '');
      const metVal = clean(metric?.[col] ?? '');
      const value = isMeasure(col) && metVal && metVal !== impVal ? `${impVal} / ${metVal}` : impVal || metVal;
      if (!value) continue;
      fields.push({ label: cleanedHeaders[col], value, unit: units[col] ?? null });
    }
    variants.push({ size, fields });
  }
  return { headers: cleanedHeaders, units, variants };
}

// single: one value per cell. One data row = one variant. Units come from
// the label (embedded) or the unit row(s); cells that hold "imp\nmet"
// (e.g. Weight "31\n68") merge into "imp / met".
function normalizeSingle(table: RawSpecTable): ProductSpecs {
  const { headers, rows } = table;
  // Unit rows are leading rows whose size cell is empty.
  let firstData = 0;
  while (firstData < rows.length && clean(rows[firstData][0] ?? '') === '') firstData++;
  const unitRows = rows.slice(0, firstData);

  const cleanedHeaders: string[] = [];
  const units: (string | null)[] = [];
  for (let i = 0; i < headers.length; i++) {
    const { label, embeddedUnit } = cleanLabel(headers[i] ?? '');
    cleanedHeaders.push(label);
    if (embeddedUnit) {
      units.push(embeddedUnit);
    } else {
      // Combine any unit-row values for this column (e.g. kg / lbs).
      const parts = unitRows.map((r) => clean(r[i] ?? '')).filter(Boolean);
      units.push(parts.length ? [...new Set(parts)].join(' / ') : null);
    }
  }

  const data = rows.slice(firstData);
  const variants: SpecVariant[] = [];
  for (const r of data) {
    const size = clean(r[0] ?? '');
    if (!size) continue;
    const fields: SpecField[] = [];
    for (let col = 1; col < headers.length; col++) {
      if (!cleanedHeaders[col]) continue;
      const value = mergeCellUnits(r[col] ?? '');
      if (!value) continue;
      fields.push({ label: cleanedHeaders[col], value, unit: units[col] ?? null });
    }
    variants.push({ size, fields });
  }
  return { headers: cleanedHeaders, units, variants };
}

function normalize(table: RawSpecTable): ProductSpecs | null {
  const { headers, rows } = table;
  if (!headers?.length || rows.length === 0) return null;

  // Per-layout minimum row counts. The `single` layout has NO leading unit
  // rows — a table is valid with just one data row — so the old blanket
  // `rows.length < 3` guard wrongly dropped small single-layout products
  // (e.g. MX325V/MX320V/MX310R: 2 data rows, no unit rows) into the raw-
  // table fallback. `paired` needs 2 unit rows + ≥1 data row; `colspan`
  // needs its unit row + ≥1 data row.
  const layout = detectLayout(table);
  const minRows = layout === 'paired' ? 3 : layout === 'colspan' ? 2 : 1;
  if (rows.length < minRows) return null;

  const specs =
    layout === 'colspan' ? normalizeColspan(table)
    : layout === 'paired' ? normalizePaired(table)
    : normalizeSingle(table);

  if (specs.variants.length === 0) return null;
  return specs;
}

for (const locale of LOCALES) {
  const src = join(SRC_DIR, `tires-${locale}.json`);
  if (!existsSync(src)) {
    console.warn(`  skip ${locale}: ${src} not found`);
    continue;
  }
  const tires = JSON.parse(readFileSync(src, 'utf8')) as RawTire[];
  const out: Record<string, ProductSpecs> = {};
  let count = 0;
  for (const tire of tires) {
    if (!tire.specTable) continue;
    const specs = normalize(tire.specTable);
    if (specs) {
      out[tire.slug] = specs;
      count++;
    }
  }
  writeFileSync(
    join(OUT_DIR, `product-specs.${locale}.json`),
    JSON.stringify(out, null, 2)
  );
  console.log(`  ${locale}: ${count} product spec tables → product-specs.${locale}.json`);
}

console.log('✓ Product specs built');
