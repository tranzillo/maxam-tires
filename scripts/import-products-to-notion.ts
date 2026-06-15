/**
 * Import extracted tire JSON into the Notion Products database.
 *
 * Usage:
 *   npx tsx scripts/import-products-to-notion.ts <locale> [--limit=N] [--dry-run]
 *
 * Examples:
 *   npx tsx scripts/import-products-to-notion.ts en --limit=5     # test 5 EN products
 *   npx tsx scripts/import-products-to-notion.ts en               # all EN products
 *   npx tsx scripts/import-products-to-notion.ts ar-ae
 *   npx tsx scripts/import-products-to-notion.ts zh-hant
 *
 * Each row = one (product, locale). Translation Group property links siblings.
 */
import { notion, decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

// Heading text per locale for the page body sections.
// Sourced from existing UI translations so the page reads natively.
const HEADINGS: Record<string, { features: string; specs: string; gallery: string }> = {
  en: { features: 'Features', specs: 'Specifications', gallery: 'Gallery' },
  'ar-ae': { features: 'الميزات', specs: 'المواصفات', gallery: 'معرض الصور' },
  'zh-hant': { features: '特點', specs: '規格', gallery: '圖庫' },
};

interface TaxRef {
  name: string;
  slug: string;
  trid: number | null;
}

interface Tire {
  wpId: number;
  trid: number;
  language: string;
  title: string;
  slug: string;
  content: string;
  subheading: string;
  details: string;
  additionalDetails: string;
  rating: number;
  industries: TaxRef[];
  applications: TaxRef[];
  tireTypes: TaxRef[];
  sizes: string[];
  features: string[];
  galleryImages: string[];
  documents: { wpId: number; title: string; type: string; filePath: string | null }[];
  featuredImage?: string;
  specTable?: { name?: string; columns?: string[]; rows?: string[][] } | null;
}

/**
 * Map of taxonomy trid → language → Notion page ID, written by
 * import-taxonomies-to-notion.ts. Used to resolve product taxonomy
 * relations to the correct same-language taxonomy row.
 */
type TaxMap = Record<string, Record<string, Record<string, string>>>;

function parseArgs() {
  const args = process.argv.slice(2);
  const locale = args[0];
  if (!locale) {
    console.error('Usage: import-products-to-notion.ts <locale> [--limit=N] [--dry-run] [--only-new]');
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  const dryRun = args.includes('--dry-run');
  const onlyNew = args.includes('--only-new');
  return { locale, limit, dryRun, onlyNew };
}

/**
 * Walk the Notion data source and return the set of WP IDs already present.
 * Used by --only-new mode so re-running the importer skips existing rows
 * instead of creating duplicates.
 */
async function fetchExistingWpIds(dataSourceId: string): Promise<Set<number>> {
  const ids = new Set<number>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const wpId = page.properties?.['WP ID']?.number;
      if (wpId != null) ids.add(wpId);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return ids;
}

/** Strip HTML tags and decode entities — feature/description copy carries WP residue. */
function clean(s: string | undefined | null): string {
  if (!s) return '';
  return decodeEntities(
    s
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Notion's rich_text array structure. Splits at 2000-char Notion limit. */
function richText(text: string): any[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900));
  return chunks.map((content) => ({ type: 'text', text: { content } }));
}

function paragraph(text: string) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText(text) },
  };
}

function heading2(text: string) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: richText(text) },
  };
}

function bullet(text: string) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function image(url: string) {
  return {
    object: 'block',
    type: 'image',
    image: { type: 'external', external: { url } },
  };
}

/** Build a Notion table block from TablePress data. Notion needs row blocks as children. */
function specTableBlock(spec: NonNullable<Tire['specTable']>) {
  const columns = (spec.columns ?? []).map(clean);
  const rows = (spec.rows ?? []).map((r) => r.map(clean));
  if (columns.length === 0 && rows.length === 0) return null;
  const width = columns.length || (rows[0]?.length ?? 0);
  if (width === 0) return null;

  const headerRow = {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: columns.map((c) => richText(c)),
    },
  };

  const bodyRows = rows.map((row) => ({
    object: 'block',
    type: 'table_row',
    table_row: {
      // Pad short rows so every row has `width` cells (Notion requirement).
      cells: Array.from({ length: width }, (_, i) => richText(row[i] ?? '')),
    },
  }));

  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: columns.length > 0,
      has_row_header: false,
      children: columns.length > 0 ? [headerRow, ...bodyRows] : bodyRows,
    },
  };
}

function buildPageBody(tire: Tire, locale: string) {
  const h = HEADINGS[locale] ?? HEADINGS.en;
  const blocks: any[] = [];

  const description = clean(tire.details);
  if (description) blocks.push(paragraph(description));

  const additional = clean(tire.additionalDetails);
  if (additional && additional !== description) blocks.push(paragraph(additional));

  if (tire.features.length > 0) {
    blocks.push(heading2(h.features));
    for (const f of tire.features) {
      const cleaned = clean(f);
      if (cleaned) blocks.push(bullet(cleaned));
    }
  }

  if (tire.specTable) {
    const tbl = specTableBlock(tire.specTable);
    if (tbl) {
      blocks.push(heading2(h.specs));
      blocks.push(tbl);
    }
  }

  if (tire.galleryImages.length > 0) {
    blocks.push(heading2(h.gallery));
    for (const url of tire.galleryImages) {
      const rewritten = rewriteMediaUrl(url);
      if (isValidNotionUrl(rewritten)) blocks.push(image(rewritten));
    }
  }

  return blocks;
}

/** Look up taxonomy page IDs in the same language as the tire. */
function resolveRelations(refs: TaxRef[], taxKey: string, language: string, taxMap: TaxMap) {
  const out: { id: string }[] = [];
  for (const ref of refs) {
    if (!ref.trid) continue;
    const pageId = taxMap[taxKey]?.[String(ref.trid)]?.[language];
    if (pageId) out.push({ id: pageId });
    else console.warn(`    ! no ${taxKey} match for trid ${ref.trid} (${language}) — ${ref.name}`);
  }
  return out;
}

function buildProperties(tire: Tire, taxMap: TaxMap) {
  const industries = resolveRelations(tire.industries, 'industries', tire.language, taxMap);
  const applications = resolveRelations(tire.applications, 'applications', tire.language, taxMap);
  const tireTypes = resolveRelations(tire.tireTypes, 'tireTypes', tire.language, taxMap);

  const props: any = {
    Name: { title: richText(decodeEntities(tire.title) || tire.slug) },
    Slug: { rich_text: richText(tire.slug) },
    Language: { select: { name: tire.language } },
    'Translation Group': { number: tire.trid },
    Subheading: { rich_text: richText(decodeEntities(tire.subheading)) },
    Industries: { relation: industries },
    Applications: { relation: applications },
    'Tire Type': { relation: tireTypes },
    Sizes: { rich_text: richText(tire.sizes.join(', ')) },
    Rating: { number: tire.rating || null },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: tire.wpId },
  };

  const featured = rewriteMediaUrl(tire.featuredImage);
  if (isValidNotionUrl(featured)) props['Featured Image'] = { url: featured };

  return props;
}

async function importTire(
  tire: Tire,
  dataSourceId: string,
  taxMap: TaxMap,
  dryRun: boolean
): Promise<{ id: string } | undefined> {
  const properties = buildProperties(tire, taxMap);
  const children = buildPageBody(tire, tire.language);

  if (dryRun) {
    console.log(`  [dry-run] ${tire.title} (${tire.language}) — ${children.length} body blocks`);
    return;
  }

  // Notion caps children per request at 100 — split into create + append if needed.
  const initial = children.slice(0, 100);
  const remaining = children.slice(100);

  // v5 API: create pages as children of a data source, not a database.
  const page: any = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dataSourceId } as any,
    properties,
    children: initial,
  });

  if (remaining.length > 0) {
    // Append in batches of 100 until done.
    for (let i = 0; i < remaining.length; i += 100) {
      await notion.blocks.children.append({
        block_id: page.id,
        children: remaining.slice(i, i + 100),
      });
    }
  }

  return { id: page.id };
}

async function main() {
  const { locale, limit, dryRun, onlyNew } = parseArgs();

  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const dataSourceId = ids.productsDataSourceId;
  if (!dataSourceId) {
    throw new Error(
      'productsDataSourceId missing in notion-ids.json — run create-notion-products-db.ts first'
    );
  }

  const taxMapPath = join(import.meta.dirname, 'output', 'notion-tax-map.json');
  if (!existsSync(taxMapPath)) {
    throw new Error('notion-tax-map.json missing — run import-taxonomies-to-notion.ts first');
  }
  const taxMap: TaxMap = JSON.parse(readFileSync(taxMapPath, 'utf8'));

  const file = join(import.meta.dirname, 'output', `tires-${locale}.json`);
  let tires: Tire[] = JSON.parse(readFileSync(file, 'utf8'));

  if (onlyNew) {
    const existing = await fetchExistingWpIds(dataSourceId);
    const before = tires.length;
    tires = tires.filter((t) => !existing.has(t.wpId));
    console.log(`  --only-new: skipping ${before - tires.length} already in Notion, importing ${tires.length}`);
  }

  if (limit) tires = tires.slice(0, limit);

  console.log(
    `Importing ${tires.length} ${locale} products → data source ${dataSourceId}${dryRun ? ' (dry run)' : ''}`
  );

  // Accumulate trid → language → pageId so we can link siblings after all
  // locales finish. We merge into the existing map if one exists from a
  // previous locale's run.
  const productMapPath = join(import.meta.dirname, 'output', 'notion-products-map.json');
  const productMap: Record<string, Record<string, string>> = existsSync(productMapPath)
    ? JSON.parse(readFileSync(productMapPath, 'utf8'))
    : {};

  let success = 0;
  let failed = 0;
  for (let i = 0; i < tires.length; i++) {
    const tire = tires[i];
    try {
      const created = await importTire(tire, dataSourceId, taxMap, dryRun);
      if (created) {
        productMap[String(tire.trid)] = productMap[String(tire.trid)] || {};
        productMap[String(tire.trid)][tire.language] = created.id;
      }
      success++;
      if (!dryRun) console.log(`  [${i + 1}/${tires.length}] ✓ ${tire.title}`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${tires.length}] ✗ ${tire.title}: ${err.message}`);
    }
    // Notion rate limit: 3 requests/sec average. ~350ms between products is safe.
    if (!dryRun) await new Promise((r) => setTimeout(r, 350));
  }

  if (!dryRun) {
    writeFileSync(productMapPath, JSON.stringify(productMap, null, 2));
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
