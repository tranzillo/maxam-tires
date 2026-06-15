/**
 * Import the three taxonomy databases (Industries, Applications, Tire Types)
 * from extracted JSON into Notion. Each row = one (term × language).
 *
 * Outputs a trid→pageId map per taxonomy at scripts/output/notion-tax-map.json
 * so the product importer can resolve relations.
 *
 * Idempotent + language-scoped (added 2026-06-13 for the multi-language port):
 *   - Pass one or more language codes to import only those languages
 *     (default: every language present in the extract files).
 *   - Skips terms already in Notion (matched on WP Term ID + language).
 *   - MERGES into the existing notion-tax-map.json instead of replacing it,
 *     so existing languages' mappings (that products already depend on) are
 *     preserved.
 *
 * Usage:
 *   npx tsx scripts/import-taxonomies-to-notion.ts [langs...] [--dry-run]
 *   npx tsx scripts/import-taxonomies-to-notion.ts de
 */
import { notion, decodeEntities, rewriteMediaUrl } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');
const MAP_FILE = join(import.meta.dirname, 'output', 'notion-tax-map.json');

/**
 * Walk a taxonomy data source and return the set of "WP Term ID::language"
 * keys already present, so re-runs skip them.
 */
async function fetchExistingKeys(dataSourceId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const wpId = page.properties?.['WP Term ID']?.number;
      const lang = page.properties?.['Language']?.select?.name;
      if (wpId != null && lang) keys.add(`${wpId}::${lang}`);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return keys;
}

interface TermRow {
  id: number;
  trid: number;
  language: string;
  name: string;
  slug: string;
  color?: string;
  bgImageUrl?: string | null;
  iconUrl?: string | null;
}

interface TaxJob {
  key: string;
  file: string;
  hasColor?: boolean;
  hasBgImage?: boolean;
  hasIcon?: boolean;
}

const JOBS: TaxJob[] = [
  { key: 'industries', file: 'industries.json', hasColor: true, hasBgImage: true },
  { key: 'applications', file: 'applications.json', hasIcon: true },
  { key: 'tireTypes', file: 'tire-types.json' },
];

function richText(text: string) {
  if (!text) return [];
  return [{ type: 'text' as const, text: { content: text.slice(0, 1900) } }];
}

async function importJob(
  job: TaxJob,
  ids: Record<string, string>,
  map: Record<string, Record<string, Record<string, string>>>,
  langs: string[] | null,
  dryRun: boolean
) {
  const dataSourceId = ids[`${job.key}DataSourceId`];
  if (!dataSourceId) throw new Error(`No data source ID for ${job.key}`);

  const path = join(import.meta.dirname, 'output', job.file);
  let terms: TermRow[] = JSON.parse(readFileSync(path, 'utf8'));

  // Language scope: only import the requested languages (default = all in file).
  if (langs) terms = terms.filter((t) => langs.includes(t.language));

  // Idempotency: skip terms already in Notion (WP Term ID + language).
  const existing = dryRun ? new Set<string>() : await fetchExistingKeys(dataSourceId);
  const before = terms.length;
  terms = terms.filter((t) => !existing.has(`${t.id}::${t.language}`));

  console.log(
    `\n── ${job.key}: ${terms.length} new rows → ${dataSourceId}` +
      ` (skipped ${before - terms.length} already present) ──`
  );

  // map structure: { taxKey: { trid: { language: pageId } } } — preserve
  // any existing entries (other languages products already rely on).
  map[job.key] = map[job.key] || {};

  let success = 0;
  let failed = 0;

  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const properties: any = {
      Name: { title: richText(decodeEntities(t.name)) },
      Slug: { rich_text: richText(t.slug) },
      Language: { select: { name: t.language } },
      'Translation Group': { number: t.trid },
      'WP Term ID': { number: t.id },
    };
    if (job.hasColor && t.color) properties.Color = { rich_text: richText(t.color) };
    if (job.hasBgImage && t.bgImageUrl) {
      const url = rewriteMediaUrl(t.bgImageUrl);
      if (url) properties['Background Image'] = { url };
    }
    if (job.hasIcon && t.iconUrl) {
      const url = rewriteMediaUrl(t.iconUrl);
      if (url) properties.Icon = { url };
    }

    if (dryRun) {
      console.log(`  [dry-run] ${t.language} ${decodeEntities(t.name)} (trid ${t.trid})`);
      success++;
      continue;
    }

    try {
      const page: any = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: dataSourceId } as any,
        properties,
      });
      map[job.key][String(t.trid)] = map[job.key][String(t.trid)] || {};
      map[job.key][String(t.trid)][t.language] = page.id;
      success++;
      console.log(`  [${i + 1}/${terms.length}] ✓ ${t.language} ${decodeEntities(t.name)}`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${terms.length}] ✗ ${t.name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`  ${job.key}: ${success} succeeded, ${failed} failed`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const langs = args.filter((a) => !a.startsWith('--'));
  const langFilter = langs.length > 0 ? langs : null;

  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));

  // MERGE into the existing map so previously-imported languages survive.
  const map: Record<string, Record<string, Record<string, string>>> =
    existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};

  console.log(langFilter ? `Languages: ${langFilter.join(', ')}` : 'Languages: all in extract');

  for (const job of JOBS) {
    await importJob(job, ids, map, langFilter, dryRun);
  }

  if (!dryRun) {
    writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
    console.log(`\n✓ Merged trid→pageId map written to ${MAP_FILE}`);
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
