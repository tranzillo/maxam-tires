/*
 * sync-product-specs.ts — read each English Product page's clean spec table from
 * Notion and produce product-specs.<lang>.json for every content language.
 *
 * This is the READER half of the product-specs Notion loop (the seed half is
 * seed-product-specs-to-notion.ts). It replaces build-product-specs.ts: instead
 * of normalizing the frozen WP TablePress export, it reads the already-clean
 * tables now living in Notion. See docs/SPECS-NOTION-MIGRATION.md.
 *
 * Model:
 *   - Spec VALUES are canonical English (one table per product, English page).
 *   - Each language reuses those values, joined with spec-headers.<lang>.json
 *     for the translated column labels.
 *   - units come from the canonical English units (spec-headers carries labels
 *     only; units are language-invariant measurement strings like "in / mm").
 *
 * Output is byte-comparable to the old build-product-specs.ts output, which is
 * the parity gate before this becomes the live source.
 *
 * Usage:
 *   npx tsx scripts/sync-product-specs.ts                 # write to src/data/notion-content
 *   npx tsx scripts/sync-product-specs.ts --out=tmp/specs # write elsewhere (parity gate)
 */
import { notion } from './notion-client.js';
import { getNotionIds } from '../src/lib/notion/client.js';
import { CONTENT_LANGUAGES } from './content-languages.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SPECS_HEADING = 'Specifications';
const NC = join('src', 'data', 'notion-content');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.split('=')[1] : NC;

// Concatenate rich-text segments WITHOUT trimming: spec values legitimately
// carry leading/trailing spaces (e.g. " / 700" = empty imperial, metric 700),
// and the build-product-specs.ts output we must match preserves them.
const cellText = (cell: any) => (cell ?? []).map((c: any) => c.plain_text ?? '').join('');

interface SpecField { label: string; value: string; unit: string | null }
interface SpecVariant { size: string; fields: SpecField[] }
interface ProductSpecs { headers: string[]; units: (string | null)[]; variants: SpecVariant[] }

/** Map every English Product page slug → its Notion page id. */
async function fetchEnPagesBySlug(dataSourceId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 });
    for (const p of res.results) {
      if (p.properties?.Language?.select?.name !== 'en') continue;
      const slug = p.properties?.Slug?.rich_text?.[0]?.plain_text;
      if (slug) out.set(slug, p.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** Read the spec table grid (string[][]) under the Specifications heading. */
async function fetchSpecGrid(pageId: string): Promise<string[][] | null> {
  const kids: any = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  let after = false;
  let tableId: string | null = null;
  for (const b of kids.results) {
    if (b.type === 'heading_2' && b.heading_2?.rich_text?.[0]?.plain_text === SPECS_HEADING) { after = true; continue; }
    if (after) { if (b.type === 'table') { tableId = b.id; break; } if (b.type?.startsWith('heading')) return null; }
  }
  if (!tableId) return null;
  const rows: any = await notion.blocks.children.list({ block_id: tableId, page_size: 100 });
  return rows.results.map((r: any) => (r.table_row?.cells || []).map(cellText));
}

/**
 * Reconstruct ProductSpecs for one product/language from the Notion value grid +
 * the per-language header array + canonical English units. grid row 0 is the
 * (English) header row written at seed time; we use langHeaders for labels so
 * each language shows its own translated columns over the shared values.
 */
function reconstruct(grid: string[][], langHeaders: string[], enUnits: (string | null)[]): ProductSpecs {
  const variants: SpecVariant[] = grid.slice(1).map((r) => ({
    size: r[0],
    fields: langHeaders.slice(1).map((label, i) => ({
      label,
      value: r[i + 1] ?? '',
      unit: enUnits[i + 1] ?? null,
    })).filter((f) => f.value !== ''),
  }));
  return { headers: langHeaders, units: enUnits, variants };
}

export async function syncProductSpecs(): Promise<Record<string, number>> {
  const ids = getNotionIds();
  const dsId = ids.productsDataSourceId;
  if (!dsId) throw new Error('productsDataSourceId missing in notion-ids.json');

  // Canonical English specs supply the units (language-invariant) and the
  // authoritative slug list. Header arrays per language supply labels.
  const enSpecs: Record<string, ProductSpecs> = JSON.parse(readFileSync(join(NC, 'product-specs.en.json'), 'utf8'));
  const headerMaps: Record<string, Record<string, string[]>> = {};
  for (const lang of CONTENT_LANGUAGES) {
    const f = join(NC, `spec-headers.${lang}.json`);
    if (existsSync(f)) headerMaps[lang] = JSON.parse(readFileSync(f, 'utf8'));
  }

  const enBySlug = await fetchEnPagesBySlug(dsId);

  // Fetch every product's value grid ONCE (values are canonical English).
  const grids = new Map<string, string[][]>();
  let fetched = 0, noTable = 0;
  for (const slug of Object.keys(enSpecs)) {
    const pageId = enBySlug.get(slug);
    if (!pageId) { noTable++; continue; }
    const grid = await fetchSpecGrid(pageId);
    if (!grid || grid.length < 2) { noTable++; continue; }
    grids.set(slug, grid);
    fetched++;
  }

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const counts: Record<string, number> = {};
  for (const lang of CONTENT_LANGUAGES) {
    const out: Record<string, ProductSpecs> = {};
    const headers = headerMaps[lang] ?? {};
    for (const [slug, grid] of grids) {
      const langHeaders = headers[slug] ?? enSpecs[slug].headers;
      out[slug] = reconstruct(grid, langHeaders, enSpecs[slug].units);
    }
    writeFileSync(join(OUT, `product-specs.${lang}.json`), JSON.stringify(out, null, 2));
    counts[lang] = Object.keys(out).length;
  }
  console.log(`  specs: ${fetched} tables read from Notion${noTable ? `, ${noTable} products without a table` : ''} → ${OUT}`);
  return counts;
}

// CLI entry (run directly, not when imported by sync-from-notion).
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('sync-product-specs.ts');
if (isMain) {
  syncProductSpecs()
    .then((c) => { console.log('✓ product specs synced:', JSON.stringify(c)); })
    .catch((e) => { console.error('spec sync failed:', e.message); process.exit(1); });
}
