/**
 * Generic content importer for events, documents, testimonials.
 * Each writes a `notion-<type>-map.json` for sibling linking.
 *
 * Usage:
 *   npx tsx scripts/import-content-to-notion.ts <type> <locale> [--limit=N] [--dry-run]
 *
 *   <type> = events | documents | testimonials
 *   <locale> = en | ar-ae | zh-hant
 */
import { notion, decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';
import { htmlToNotionBlocks } from './html-to-notion.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

type ContentType = 'events' | 'documents' | 'testimonials';

function parseArgs() {
  const [type, locale, ...rest] = process.argv.slice(2);
  if (!type || !locale) {
    console.error('Usage: import-content-to-notion.ts <type> <locale> [--limit=N] [--dry-run] [--only-new]');
    process.exit(1);
  }
  if (!['events', 'documents', 'testimonials'].includes(type)) {
    throw new Error(`Unknown type: ${type}`);
  }
  const limitArg = rest.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  const dryRun = rest.includes('--dry-run');
  const onlyNew = rest.includes('--only-new');
  return { type: type as ContentType, locale, limit, dryRun, onlyNew };
}

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

function richText(text: string) {
  if (!text) return [];
  const decoded = decodeEntities(text);
  return [{ type: 'text' as const, text: { content: decoded.slice(0, 1900) } }];
}

function isoDate(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  // Accept "2025-05-15" or "2025-05-15 00:00:00" — Notion wants YYYY-MM-DD or full ISO.
  const slice = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : undefined;
}

function buildEventProps(e: any) {
  const props: any = {
    Name: { title: richText(e.title || e.slug) },
    Slug: { rich_text: richText(e.slug) },
    Language: { select: { name: e.language } },
    'Translation Group': { number: e.trid },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: e.wpId },
  };
  const start = isoDate(e.startDate);
  if (start) props['Start Date'] = { date: { start } };
  const end = isoDate(e.endDate);
  if (end) props['End Date'] = { date: { start: end } };
  const fi = rewriteMediaUrl(e.featuredImage ?? '');
  if (isValidNotionUrl(fi)) props['Featured Image'] = { url: fi };
  return props;
}

function buildDocumentProps(d: any) {
  const props: any = {
    Name: { title: richText(d.title || d.slug) },
    Slug: { rich_text: richText(d.slug) },
    Language: { select: { name: d.language } },
    'Translation Group': { number: d.trid },
    Type: { select: { name: d.type } },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: d.wpId },
  };
  const file = rewriteMediaUrl(d.fileUrl ?? '');
  if (isValidNotionUrl(file)) props['File URL'] = { url: file };
  const thumb = rewriteMediaUrl(d.thumbnail ?? '');
  if (isValidNotionUrl(thumb)) props.Thumbnail = { url: thumb };
  return props;
}

function buildTestimonialProps(t: any) {
  return {
    Name: { title: richText(t.title || t.slug) },
    Slug: { rich_text: richText(t.slug) },
    Language: { select: { name: t.language } },
    'Translation Group': { number: t.trid },
    Quote: { rich_text: richText(t.quote) },
    'Author Name': { rich_text: richText(t.authorName) },
    'Author Title': { rich_text: richText(t.authorTitle) },
    'Author Company': { rich_text: richText(t.authorCompany) },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: t.wpId },
  };
}

async function main() {
  const { type, locale, limit, dryRun, onlyNew } = parseArgs();
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const dataSourceId = ids[`${type}DataSourceId`];
  if (!dataSourceId) throw new Error(`No data source for ${type} — run create script first`);

  const file = join(import.meta.dirname, 'output', `${type}-${locale}.json`);
  let items: any[] = JSON.parse(readFileSync(file, 'utf8'));

  if (onlyNew) {
    const existing = await fetchExistingWpIds(dataSourceId);
    const before = items.length;
    items = items.filter((it) => !existing.has(it.wpId));
    console.log(`  --only-new: skipping ${before - items.length} already in Notion, importing ${items.length}`);
  }

  if (limit) items = items.slice(0, limit);

  const mapPath = join(import.meta.dirname, 'output', `notion-${type}-map.json`);
  const map: Record<string, Record<string, string>> = existsSync(mapPath)
    ? JSON.parse(readFileSync(mapPath, 'utf8'))
    : {};

  console.log(
    `Importing ${items.length} ${locale} ${type} → ${dataSourceId}${dryRun ? ' (dry run)' : ''}`
  );

  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const properties =
        type === 'events'
          ? buildEventProps(item)
          : type === 'documents'
            ? buildDocumentProps(item)
            : buildTestimonialProps(item);

      // Events get an HTML body; docs/testimonials don't.
      const children = type === 'events' ? htmlToNotionBlocks(item.bodyHtml ?? '') : [];

      if (dryRun) {
        console.log(`  [dry-run] ${item.title} (${item.language}) — ${children.length} body blocks`);
        success++;
        continue;
      }

      const initial = children.slice(0, 100);
      const remaining = children.slice(100);

      const page: any = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: dataSourceId } as any,
        properties,
        children: initial,
      });

      for (let j = 0; j < remaining.length; j += 100) {
        await notion.blocks.children.append({
          block_id: page.id,
          children: remaining.slice(j, j + 100),
        });
      }

      map[String(item.trid)] = map[String(item.trid)] || {};
      map[String(item.trid)][item.language] = page.id;
      success++;
      console.log(`  [${i + 1}/${items.length}] ✓ ${item.title.slice(0, 60)}`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${items.length}] ✗ ${item.title}: ${err.message}`);
    }
    if (!dryRun) await new Promise((r) => setTimeout(r, 350));
  }

  if (!dryRun) writeFileSync(mapPath, JSON.stringify(map, null, 2));

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
