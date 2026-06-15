/**
 * Import articles JSON into the Notion Articles database.
 * One row per (article × locale). Body produced by html-to-notion.ts.
 *
 * Outputs scripts/output/notion-article-map.json (trid → language → pageId)
 * for the sibling-linking pass.
 *
 * Usage:
 *   npx tsx scripts/import-articles-to-notion.ts <locale> [--limit=N] [--dry-run]
 */
import { notion, decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';
import { htmlToNotionBlocks } from './html-to-notion.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');
const MAP_FILE = join(import.meta.dirname, 'output', 'notion-article-map.json');

interface Article {
  wpId: number;
  trid: number;
  language: string;
  type: 'blog' | 'press-release' | 'in-the-news';
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  publishedDate: string;
  modifiedDate: string;
  externalLink: string | null;
  featuredImage: string | null;
  authorName: string | null;
  /** Industry slugs from WP `category` taxonomy (set during extract). */
  industries?: string[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const locale = args[0];
  if (!locale) {
    console.error('Usage: import-articles-to-notion.ts <locale> [--limit=N] [--dry-run] [--only-new]');
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  const dryRun = args.includes('--dry-run');
  const onlyNew = args.includes('--only-new');
  return { locale, limit, dryRun, onlyNew };
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

function buildProperties(a: Article) {
  const props: any = {
    Name: { title: richText(a.title || a.slug) },
    Slug: { rich_text: richText(a.slug) },
    Language: { select: { name: a.language } },
    'Translation Group': { number: a.trid },
    Type: { select: { name: a.type } },
    Excerpt: { rich_text: richText(a.excerpt) },
    'Published Date': { date: { start: a.publishedDate.slice(0, 10) } },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: a.wpId },
  };
  if (a.externalLink && isValidNotionUrl(a.externalLink)) {
    props['External Link'] = { url: a.externalLink };
  }
  const fi = rewriteMediaUrl(a.featuredImage ?? '');
  if (isValidNotionUrl(fi)) props['Featured Image'] = { url: fi };
  if (a.authorName) props.Author = { rich_text: richText(a.authorName) };
  return props;
}

async function importArticle(a: Article, dataSourceId: string, dryRun: boolean) {
  const properties = buildProperties(a);
  const body = htmlToNotionBlocks(a.bodyHtml);

  if (dryRun) {
    console.log(`  [dry-run] ${a.title} (${a.language}, ${a.type}) — ${body.length} blocks`);
    return undefined;
  }

  // Notion caps children at 100 per request — split into create + append.
  const initial = body.slice(0, 100);
  const remaining = body.slice(100);

  const page: any = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dataSourceId } as any,
    properties,
    children: initial,
  });

  for (let i = 0; i < remaining.length; i += 100) {
    await notion.blocks.children.append({
      block_id: page.id,
      children: remaining.slice(i, i + 100),
    });
  }

  return { id: page.id };
}

async function main() {
  const { locale, limit, dryRun, onlyNew } = parseArgs();
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const dataSourceId = ids.articlesDataSourceId;
  if (!dataSourceId) throw new Error('articlesDataSourceId missing — run create script first');

  const file = join(import.meta.dirname, 'output', `articles-${locale}.json`);
  let articles: Article[] = JSON.parse(readFileSync(file, 'utf8'));

  if (onlyNew) {
    const existing = await fetchExistingWpIds(dataSourceId);
    const before = articles.length;
    articles = articles.filter((a) => !existing.has(a.wpId));
    console.log(`  --only-new: skipping ${before - articles.length} already in Notion, importing ${articles.length}`);
  }

  if (limit) articles = articles.slice(0, limit);

  console.log(
    `Importing ${articles.length} ${locale} articles → ${dataSourceId}${dryRun ? ' (dry run)' : ''}`
  );

  // Accumulate trid → language → pageId for the linking pass.
  const map: Record<string, Record<string, string>> = existsSync(MAP_FILE)
    ? JSON.parse(readFileSync(MAP_FILE, 'utf8'))
    : {};

  let success = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    try {
      const created = await importArticle(a, dataSourceId, dryRun);
      if (created) {
        map[String(a.trid)] = map[String(a.trid)] || {};
        map[String(a.trid)][a.language] = created.id;
      }
      success++;
      if (!dryRun) console.log(`  [${i + 1}/${articles.length}] ✓ ${a.title.slice(0, 60)}`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${articles.length}] ✗ ${a.title}: ${err.message}`);
    }
    if (!dryRun) await new Promise((r) => setTimeout(r, 350));
  }

  if (!dryRun) writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
