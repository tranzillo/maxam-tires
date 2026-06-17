/*
 * seed-product-specs-to-notion.ts — replace each English Product page's raw
 * TablePress spec dump with the CLEAN normalized spec table, so specs live in
 * Notion in the same shape the site renders (one row per size, merged
 * imperial/metric values, a real header row).
 *
 * See docs/SPECS-NOTION-MIGRATION.md. This is the seed step of closing the
 * product-specs Notion loop. After this + the sync reader, build-product-specs.ts
 * (the frozen-WP-export path) is retired.
 *
 * Source of truth: src/data/notion-content/product-specs.en.json — the clean
 * { headers, units, variants } already produced by build-product-specs.ts.
 * Values canonicalize on English (decision 2026-06-17), so only the English page
 * holds a spec table; other languages reuse these values at sync time, joined
 * with spec-headers.<lang>.json.
 *
 * Matching: English Product pages are found by their Notion `Slug` property
 * (the WP-ID id-map has diverged and is NOT used). 117/117 resolve.
 *
 * Idempotent: re-running archives the existing table under the "Specifications"
 * heading and appends a fresh one. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/seed-product-specs-to-notion.ts --only=agilxtra [--dry-run]
 *   npx tsx scripts/seed-product-specs-to-notion.ts            # all 117
 *   npx tsx scripts/seed-product-specs-to-notion.ts --dry-run  # preview all
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const dryRun = process.argv.includes('--dry-run');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : undefined;

const SPECS_HEADING = 'Specifications';

interface SpecField { label: string; value: string; unit: string | null }
interface SpecVariant { size: string; fields: SpecField[] }
interface ProductSpecs { headers: string[]; units: (string | null)[]; variants: SpecVariant[] }

function richText(content: string, bold = false) {
  return content ? [{ type: 'text' as const, text: { content }, annotations: bold ? { bold: true } : undefined }] : [];
}

/**
 * Build a clean Notion table block from normalized specs.
 * Row 0 = headers (bold, has_column_header). Each subsequent row = one variant:
 * the size in column 0, then each field's value aligned to its header column.
 */
function buildTableBlock(specs: ProductSpecs) {
  const headers = specs.headers; // headers[0] is the Size column label
  const width = headers.length;
  const headerRow = {
    object: 'block' as const,
    type: 'table_row' as const,
    table_row: { cells: headers.map((h) => richText(h, true)) },
  };
  const rows = specs.variants.map((v) => {
    // Align fields to header columns by label, consuming each field once so
    // DUPLICATE headers (e.g. two "Infl. P." / two "L.C.C." columns — different
    // load ratings) pick up their fields in order. A plain label->value map
    // would collapse duplicates to the last value (the parity-gate bug).
    // `fields` omits empty cells, so we match per-label FIFO rather than by
    // position.
    const queues = new Map<string, string[]>();
    for (const f of v.fields) {
      if (!queues.has(f.label)) queues.set(f.label, []);
      queues.get(f.label)!.push(f.value);
    }
    const cells = headers.map((h, i) => {
      if (i === 0) return richText(v.size);
      const q = queues.get(h);
      return richText(q && q.length ? q.shift()! : '');
    });
    return { object: 'block' as const, type: 'table_row' as const, table_row: { cells } };
  });
  return {
    object: 'block' as const,
    type: 'table' as const,
    table: { table_width: width, has_column_header: true, has_row_header: false, children: [headerRow, ...rows] },
  };
}

/** Find the English Product page id for every slug, via the Slug property. */
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

/**
 * Locate the "Specifications" heading and the table block (if any) directly
 * under it. Returns both ids so we can append the new table immediately AFTER
 * the heading (Notion's append goes to page-end unless given `after`).
 */
async function findSpecSection(pageId: string): Promise<{ headingId: string | null; tableId: string | null }> {
  const kids: any = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  let headingId: string | null = null;
  let afterHeading = false;
  for (const b of kids.results) {
    if (b.type === 'heading_2' && b.heading_2?.rich_text?.[0]?.plain_text === SPECS_HEADING) {
      headingId = b.id;
      afterHeading = true;
      continue;
    }
    if (afterHeading) {
      if (b.type === 'table') return { headingId, tableId: b.id };
      if (b.type?.startsWith('heading')) return { headingId, tableId: null }; // next section
    }
  }
  return { headingId, tableId: null };
}

async function main() {
  const ids = JSON.parse(readFileSync('scripts/output/notion-ids.json', 'utf8'));
  const dsId = ids.productsDataSourceId;
  const specs: Record<string, ProductSpecs> = JSON.parse(
    readFileSync(join('src', 'data', 'notion-content', 'product-specs.en.json'), 'utf8')
  );

  let slugs = Object.keys(specs);
  if (only) slugs = slugs.filter((s) => s === only);
  if (slugs.length === 0) { console.error(`No spec product matches --only=${only}`); process.exit(1); }
  console.log(`Seeding ${slugs.length} product spec table(s)${dryRun ? ' (dry run — no writes)' : ''}`);

  const enBySlug = await fetchEnPagesBySlug(dsId);

  let done = 0, replaced = 0, appended = 0, missing = 0;
  for (const slug of slugs) {
    const pageId = enBySlug.get(slug);
    if (!pageId) { missing++; console.warn(`  ! ${slug}: no English Notion page`); continue; }

    const block = buildTableBlock(specs[slug]);
    const { headingId, tableId } = await findSpecSection(pageId);
    if (!headingId) { missing++; console.warn(`  ! ${slug}: no "${SPECS_HEADING}" heading on page`); continue; }

    if (dryRun) {
      console.log(`  [dry-run] ${slug}: ${specs[slug].variants.length} sizes × ${specs[slug].headers.length} cols${tableId ? ' (would replace existing table)' : ' (would insert under heading)'}`);
      done++;
      continue;
    }

    if (tableId) { await notion.blocks.update({ block_id: tableId, archived: true } as any); replaced++; }
    else appended++;
    // Insert directly AFTER the Specifications heading (append() alone goes to
    // page-end). `after` keeps the table in its proper section.
    await notion.blocks.children.append({ block_id: pageId, children: [block as any], after: headingId } as any);
    done++;
    console.log(`  ✓ ${slug}: table seeded (${specs[slug].variants.length} sizes)${tableId ? ' [replaced]' : ' [new]'}`);
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nDone: ${done} seeded (${replaced} replaced, ${appended} new)${missing ? `, ${missing} missing page` : ''}.`);
  if (!dryRun) console.log('Next: build the sync reader, then diff its output vs product-specs.*.json.');
}
main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
