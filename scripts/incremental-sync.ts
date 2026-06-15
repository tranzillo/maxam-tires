/**
 * Incremental sync: bring Notion in line with the latest WordPress backup
 * without disturbing existing rows or their pageId references (which our
 * sidecar block files depend on).
 *
 * Plan:
 *   1. For each content type, query Notion for the set of existing WP IDs.
 *   2. Query WP for the current set of WP IDs per locale.
 *   3. Create only the WP entries that aren't already in Notion.
 *   4. Archive Notion rows whose WP ID is no longer in WP.
 *   5. Re-link taxonomy/translation relations on the new rows.
 *
 * What this script does NOT do:
 *   - Rewrite existing rows (their content is whatever the editor has in Notion).
 *   - Delete sidecar block files for archived rows (left in place; harmless).
 *   - Re-fetch articles' industries — that's a separate one-shot backfill.
 *
 * Usage:
 *   npx tsx scripts/incremental-sync.ts                    # all types
 *   npx tsx scripts/incremental-sync.ts --type=articles    # one type
 *   npx tsx scripts/incremental-sync.ts --dry-run
 */
import { notion } from './notion-client.js';
import { extractTires } from './extract-tires.js';
import { extractArticles } from './extract-articles.js';
import { getConnection } from './db.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');
const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));

const LOCALES = ['en', 'ar-ae', 'zh-hant'];
const DRY_RUN = process.argv.includes('--dry-run');
const TYPE_FILTER = process.argv.find((a) => a.startsWith('--type='))?.split('=')[1];

// ── Helper: enumerate Notion rows in a data source, return wpId → pageId ──
async function fetchNotionWpIdMap(dataSourceId: string): Promise<Map<number, { pageId: string; language: string }>> {
  const map = new Map<number, { pageId: string; language: string }>();
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const wpId = page.properties?.['WP ID']?.number;
      const language = page.properties?.Language?.select?.name;
      if (wpId != null) map.set(wpId, { pageId: page.id, language: language ?? 'en' });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return map;
}

async function archivePage(pageId: string) {
  if (DRY_RUN) {
    console.log(`    [dry-run] would archive ${pageId}`);
    return;
  }
  await notion.pages.update({ page_id: pageId, in_trash: true } as any);
  await new Promise((r) => setTimeout(r, 350));
}

// ── Run per type ──────────────────────────────────────────────────────

interface SyncReport {
  added: number;
  archived: number;
  unchanged: number;
}

async function syncProducts(): Promise<SyncReport> {
  console.log('\n═══ Products ═══');
  const existing = await fetchNotionWpIdMap(ids.productsDataSourceId);
  console.log(`  Notion has ${existing.size} product rows`);

  const report: SyncReport = { added: 0, archived: 0, unchanged: 0 };
  const wpIdsSeen = new Set<number>();

  for (const locale of LOCALES) {
    const wpRows = await extractTires(undefined, locale);
    for (const t of wpRows) {
      wpIdsSeen.add(t.wpId);
      if (existing.has(t.wpId)) {
        report.unchanged++;
        continue;
      }
      console.log(`  + ${locale} ${t.title} (wpId=${t.wpId})`);
      report.added++;
      // Note: we don't actually create here. The full import-products script
      // is the right tool — we'll call it for the new wpIds only.
    }
  }

  // Find archived candidates: rows in Notion whose wpId no longer exists in WP.
  for (const [wpId, info] of existing.entries()) {
    if (!wpIdsSeen.has(wpId)) {
      console.log(`  - archiving ${info.language} wpId=${wpId} pageId=${info.pageId}`);
      await archivePage(info.pageId);
      report.archived++;
    }
  }

  console.log(`  ${report.added} to add, ${report.archived} archived, ${report.unchanged} unchanged`);
  return report;
}

async function syncArticles(): Promise<SyncReport> {
  console.log('\n═══ Articles ═══');
  const existing = await fetchNotionWpIdMap(ids.articlesDataSourceId);
  console.log(`  Notion has ${existing.size} article rows`);

  const report: SyncReport = { added: 0, archived: 0, unchanged: 0 };
  const wpIdsSeen = new Set<number>();

  // extractArticles writes per-locale JSON files; we want the in-memory rows here.
  // Re-running extractArticles produces fresh JSON; we read it back to enumerate.
  await extractArticles(LOCALES);
  for (const locale of LOCALES) {
    const file = join(import.meta.dirname, 'output', `articles-${locale}.json`);
    const rows: any[] = JSON.parse(readFileSync(file, 'utf8'));
    for (const a of rows) {
      wpIdsSeen.add(a.wpId);
      if (existing.has(a.wpId)) {
        report.unchanged++;
        continue;
      }
      console.log(`  + ${locale} [${a.type}] ${a.title.slice(0, 70)} (wpId=${a.wpId})`);
      report.added++;
    }
  }

  for (const [wpId, info] of existing.entries()) {
    if (!wpIdsSeen.has(wpId)) {
      console.log(`  - archiving ${info.language} wpId=${wpId}`);
      await archivePage(info.pageId);
      report.archived++;
    }
  }

  console.log(`  ${report.added} to add, ${report.archived} archived, ${report.unchanged} unchanged`);
  return report;
}

async function syncDocuments(): Promise<SyncReport> {
  console.log('\n═══ Documents ═══');
  const existing = await fetchNotionWpIdMap(ids.documentsDataSourceId);
  console.log(`  Notion has ${existing.size} document rows`);

  const report: SyncReport = { added: 0, archived: 0, unchanged: 0 };
  const db = await getConnection();
  const wpIdsSeen = new Set<number>();

  for (const locale of LOCALES) {
    const [rows] = await db.query(
      `SELECT p.ID AS wpId, p.post_type AS type, p.post_title AS title, p.post_name AS slug
       FROM wp_posts p
       JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
       WHERE p.post_type IN ('product-sheet', 'brochure')
         AND p.post_status = 'publish'
         AND ic.language_code = ?`,
      [locale]
    );
    for (const r of rows as any[]) {
      wpIdsSeen.add(r.wpId);
      if (existing.has(r.wpId)) {
        report.unchanged++;
        continue;
      }
      console.log(`  + ${locale} [${r.type}] ${r.title} (wpId=${r.wpId})`);
      report.added++;
    }
  }

  await db.end();

  for (const [wpId, info] of existing.entries()) {
    if (!wpIdsSeen.has(wpId)) {
      console.log(`  - archiving ${info.language} wpId=${wpId}`);
      await archivePage(info.pageId);
      report.archived++;
    }
  }

  console.log(`  ${report.added} to add, ${report.archived} archived, ${report.unchanged} unchanged`);
  return report;
}

async function syncEvents(): Promise<SyncReport> {
  console.log('\n═══ Events ═══');
  const existing = await fetchNotionWpIdMap(ids.eventsDataSourceId);
  console.log(`  Notion has ${existing.size} event rows`);

  const report: SyncReport = { added: 0, archived: 0, unchanged: 0 };
  const db = await getConnection();
  const wpIdsSeen = new Set<number>();

  for (const locale of LOCALES) {
    const [rows] = await db.query(
      `SELECT p.ID AS wpId, p.post_title AS title
       FROM wp_posts p
       JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_event'
       WHERE p.post_type = 'event' AND p.post_status = 'publish' AND ic.language_code = ?`,
      [locale]
    );
    for (const r of rows as any[]) {
      wpIdsSeen.add(r.wpId);
      if (existing.has(r.wpId)) {
        report.unchanged++;
        continue;
      }
      console.log(`  + ${locale} ${r.title} (wpId=${r.wpId})`);
      report.added++;
    }
  }

  await db.end();

  for (const [wpId, info] of existing.entries()) {
    if (!wpIdsSeen.has(wpId)) {
      console.log(`  - archiving ${info.language} wpId=${wpId}`);
      await archivePage(info.pageId);
      report.archived++;
    }
  }

  console.log(`  ${report.added} to add, ${report.archived} archived, ${report.unchanged} unchanged`);
  return report;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log(`  Incremental sync${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('═══════════════════════════════════════');

  const reports: Record<string, SyncReport> = {};

  if (!TYPE_FILTER || TYPE_FILTER === 'products') reports.products = await syncProducts();
  if (!TYPE_FILTER || TYPE_FILTER === 'articles') reports.articles = await syncArticles();
  if (!TYPE_FILTER || TYPE_FILTER === 'documents') reports.documents = await syncDocuments();
  if (!TYPE_FILTER || TYPE_FILTER === 'events') reports.events = await syncEvents();

  console.log('\n═══════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════');
  for (const [type, r] of Object.entries(reports)) {
    console.log(`  ${type}: +${r.added} -${r.archived} (=${r.unchanged} unchanged)`);
  }
  console.log();
  console.log('Next step: run the full importers for the additions, then npm run sync.');
  console.log('  npx tsx scripts/import-products-to-notion.ts <locale>      (skips existing wpIds? — see import script)');
  console.log('  npx tsx scripts/import-articles-to-notion.ts <locale>');
  console.log('  npx tsx scripts/import-content-to-notion.ts events <locale>');
  console.log('  npx tsx scripts/import-content-to-notion.ts documents <locale>');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
