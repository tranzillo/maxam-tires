/*
 * realign-articles-to-notion.ts — one-time repair to make the Notion Articles DB
 * the complete, authoritative source again.
 *
 * Background (docs/PROGRESS-2026-06-17.md): Notion's Articles DB drifted into an
 * INCOMPLETE copy of the WP extract. 34 articles are missing entirely (the
 * table-containing ones, never re-imported after the converter fix) and ~16 have
 * TRUNCATED bodies from an older converter import (e.g. 7 blocks where the current
 * converter produces 112). The WP extract (scripts/output/articles-en.json, 358
 * articles) is the complete source; the committed sidecars already match it. A
 * full `npm run sync` reads Notion only, so it silently DROPS the 34 and
 * TRUNCATES the 16 — destroying content. This script realigns Notion so a full
 * sync is safe.
 *
 * For each English article whose Notion body is missing or significantly shorter
 * than the current converter output for its WP bodyHtml:
 *   - MISSING  → create the page with full body.
 *   - TRUNCATED → archive the stale page, create a fresh one with full body.
 * Articles whose Notion body already matches (308 of 358) are left untouched.
 *
 * Matching is by SLUG (the WP-ID map has diverged and is unreliable). Resources
 * are English-only, so only articles-en.json is touched.
 *
 * Idempotent: re-running re-detects state and only re-imports what's still
 * missing/truncated. Dry-run shows the plan without writing.
 *
 * Usage:
 *   npx tsx scripts/realign-articles-to-notion.ts --dry-run
 *   npx tsx scripts/realign-articles-to-notion.ts [--limit=N]
 *   (then: npm run sync -- --only-lang=en   to refresh sidecars from the now-complete Notion)
 */
import { notion, decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';
import { getNotionIds } from '../src/lib/notion/client.js';
import { htmlToNotionBlocks } from './html-to-notion.js';
import { readFileSync } from 'fs';

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
// A Notion body counts as "truncated" if it has < TRUNC_RATIO of the expected
// block count (and the article is non-trivial). 0.8 catches real truncation
// while tolerating minor converter drift on already-good articles.
const TRUNC_RATIO = 0.8;
const MIN_BLOCKS = 5;

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

/** Map every English Notion article slug → pageId. */
async function fetchNotionEnArticles(dsId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({ data_source_id: dsId, start_cursor: cursor, page_size: 100 });
    for (const p of res.results) {
      if (p.properties?.Language?.select?.name !== 'en') continue;
      const slug = p.properties?.Slug?.rich_text?.[0]?.plain_text;
      if (slug) out.set(slug, p.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** Full (paginated) top-level block count of a page. */
async function blockCount(pageId: string): Promise<number> {
  let count = 0, cursor: string | undefined;
  do {
    const kids: any = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    count += kids.results.length;
    cursor = kids.has_more ? kids.next_cursor : undefined;
  } while (cursor);
  return count;
}

/** Create a Notion page with the full body (chunked at 100 blocks). */
async function createWithBody(dsId: string, a: any, body: any[]): Promise<string> {
  const page: any = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: dsId } as any,
    properties: buildProperties(a),
    children: body.slice(0, 100),
  });
  for (let i = 100; i < body.length; i += 100) {
    await notion.blocks.children.append({ block_id: page.id, children: body.slice(i, i + 100) });
  }
  return page.id;
}

async function main() {
  const ids = getNotionIds();
  const dsId = (ids as any).articlesDataSourceId;
  if (!dsId) throw new Error('articlesDataSourceId missing');

  const extract: any[] = JSON.parse(readFileSync('scripts/output/articles-en.json', 'utf8'));
  const notionBySlug = await fetchNotionEnArticles(dsId);
  console.log(`WP extract: ${extract.length} en | Notion: ${notionBySlug.size} en\n`);

  // Classify every article: missing / truncated / ok.
  const plan: { a: any; action: 'create' | 'recreate'; pageId?: string; expected: number; actual: number }[] = [];
  let scanned = 0;
  for (const a of extract) {
    if (!a.bodyHtml || a.bodyHtml.length < 50) continue;
    const expected = htmlToNotionBlocks(a.bodyHtml).length;
    const pageId = notionBySlug.get(a.slug);
    if (!pageId) {
      plan.push({ a, action: 'create', expected, actual: 0 });
    } else {
      const actual = await blockCount(pageId);
      if (expected > MIN_BLOCKS && actual < expected * TRUNC_RATIO) {
        plan.push({ a, action: 'recreate', pageId, expected, actual });
      }
    }
    if (++scanned % 50 === 0) process.stderr.write(`  scanned ${scanned}/${extract.length}...\n`);
  }

  const creates = plan.filter((p) => p.action === 'create');
  const recreates = plan.filter((p) => p.action === 'recreate');
  console.log(`Plan: ${creates.length} MISSING (create), ${recreates.length} TRUNCATED (archive+recreate), ${extract.length - plan.length} OK\n`);

  let todo = plan;
  if (limit) todo = todo.slice(0, limit);

  if (dryRun) {
    todo.forEach((p) => console.log(`  [dry-run] ${p.action.toUpperCase()} ${p.a.slug} (notion ${p.actual} → full ${p.expected} blocks)`));
    console.log(`\n(dry run — no writes). ${todo.length} would be re-imported.`);
    return;
  }

  let done = 0, failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    try {
      const body = htmlToNotionBlocks(p.a.bodyHtml);
      if (p.action === 'recreate' && p.pageId) {
        await notion.pages.update({ page_id: p.pageId, archived: true } as any);
      }
      await createWithBody(dsId, p.a, body);
      done++;
      console.log(`  [${i + 1}/${todo.length}] ✓ ${p.action} ${p.a.slug} (${body.length} blocks)`);
    } catch (err: any) {
      failed++;
      console.error(`  [${i + 1}/${todo.length}] ✗ ${p.a.slug}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\nDone: ${done} re-imported, ${failed} failed.`);
  if (failed === 0) console.log('Next: npm run sync -- --only-lang=en   (refresh sidecars from the now-complete Notion)');
}
main().catch((e) => { console.error('Realign failed:', e.message); process.exit(1); });
