/**
 * Re-import the English articles whose WP body contains an HTML <table>, so the
 * fixed html-to-notion converter (which now emits real Notion table blocks
 * instead of a "[table content omitted]" placeholder) replaces the bad content
 * in Notion. One-time repair.
 *
 * For each affected article: find its existing Notion page by WP ID, ARCHIVE
 * it, then re-create it with fresh properties + body blocks. Resources are
 * English-only, so only `articles-en.json` is touched and no translation
 * re-linking is needed.
 *
 * Usage:
 *   npx tsx scripts/reimport-articles-with-tables.ts [--dry-run] [--limit=N]
 *   (then: npm run sync -- --only-lang=en  — to refresh the block sidecars)
 */
import { notion, decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';
import { htmlToNotionBlocks } from './html-to-notion.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

function richText(text: string) {
  if (!text) return [];
  return [{ type: 'text' as const, text: { content: decodeEntities(text).slice(0, 1900) } }];
}

function buildProperties(a: any) {
  const props: any = {
    Name: { title: richText(a.title || a.slug) },
    Slug: { rich_text: richText(a.slug) },
    Language: { select: { name: a.language } },
    'Translation Group': { number: a.trid },
    Type: { select: { name: a.type } },
    Excerpt: { rich_text: richText(a.excerpt) },
    'Published Date': { date: { start: (a.publishedDate || '').slice(0, 10) || undefined } },
    Status: { select: { name: 'Published' } },
    'WP ID': { number: a.wpId },
  };
  if (a.externalLink && isValidNotionUrl(a.externalLink)) props['External Link'] = { url: a.externalLink };
  const fi = rewriteMediaUrl(a.featuredImage ?? '');
  if (isValidNotionUrl(fi)) props['Featured Image'] = { url: fi };
  if (a.authorName) props.Author = { rich_text: richText(a.authorName) };
  return props;
}

/** Map WP ID → existing Notion page id (for the articles we need to replace). */
async function fetchPageIdsByWpId(dataSourceId: string, wpIds: Set<number>): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const wpId = page.properties?.['WP ID']?.number;
      if (wpId != null && wpIds.has(wpId)) out.set(wpId, page.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function main() {
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const dataSourceId = ids.articlesDataSourceId;
  if (!dataSourceId) throw new Error('articlesDataSourceId missing');

  const articles: any[] = JSON.parse(
    readFileSync(join(import.meta.dirname, 'output', 'articles-en.json'), 'utf8')
  );

  let affected = articles.filter((a) => (a.bodyHtml || '').includes('<table'));
  if (limit) affected = affected.slice(0, limit);
  console.log(`${affected.length} English articles contain a <table>${dryRun ? ' (dry run)' : ''}`);

  const wpIds = new Set<number>(affected.map((a) => a.wpId));
  const pageByWpId = dryRun ? new Map() : await fetchPageIdsByWpId(dataSourceId, wpIds);

  let success = 0, failed = 0, missing = 0;
  for (let i = 0; i < affected.length; i++) {
    const a = affected[i];
    const body = htmlToNotionBlocks(a.bodyHtml);
    const tables = body.filter((b: any) => b.type === 'table').length;

    if (dryRun) {
      console.log(`  [dry-run] ${a.slug} — ${body.length} blocks, ${tables} table(s)`);
      success++;
      continue;
    }

    try {
      // Archive the existing page (if found) so we don't leave a duplicate.
      const existing = pageByWpId.get(a.wpId);
      if (existing) {
        await notion.pages.update({ page_id: existing, archived: true });
      } else {
        missing++;
      }

      // Re-create with the fixed body.
      const initial = body.slice(0, 100);
      const remaining = body.slice(100);
      const page: any = await notion.pages.create({
        parent: { type: 'data_source_id', data_source_id: dataSourceId } as any,
        properties: buildProperties(a),
        children: initial,
      });
      for (let j = 0; j < remaining.length; j += 100) {
        await notion.blocks.children.append({
          block_id: page.id,
          children: remaining.slice(j, j + 100),
        });
      }
      success++;
      console.log(`  [${i + 1}/${affected.length}] ✓ ${a.slug} (${tables} table${tables === 1 ? '' : 's'})`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${affected.length}] ✗ ${a.slug}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\nDone: ${success} re-imported, ${failed} failed, ${missing} had no existing page (created fresh).`);
  if (!dryRun) console.log('Next: npm run sync -- --only-lang=en   (refresh the article block sidecars)');
}

main().catch((e) => { console.error('Re-import failed:', e); process.exit(1); });
