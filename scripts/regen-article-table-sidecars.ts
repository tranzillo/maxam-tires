/**
 * Regenerate the block sidecars for English articles whose rendered body still
 * shows "[table content omitted]", using the FIXED html-to-notion converter
 * (which now emits real Notion table blocks).
 *
 * Why direct-from-WP-HTML rather than a Notion round-trip: the affected
 * articles' sidecars were produced by an older import that has diverged from
 * the current Notion Articles DB (34 of them aren't even in Notion anymore),
 * so a clean Notion re-import isn't possible. The article snapshots
 * (articles.json) were built from the WP extract (articles-en.json), which IS
 * the consistent source — so we regenerate the sidecars from that same HTML.
 * The sidecar format matches exactly what sync-from-notion writes
 * (JSON.stringify of the block array, keyed `article-en-<slug>.json`).
 *
 * Idempotent + safe: only rewrites sidecars that currently contain the
 * placeholder AND whose WP HTML actually has a <table>.
 *
 * Usage: npx tsx scripts/regen-article-table-sidecars.ts [--dry-run]
 */
import { htmlToNotionBlocks } from './html-to-notion.js';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const dryRun = process.argv.includes('--dry-run');
const BLOCKS = join(import.meta.dirname, '..', 'src', 'data', 'notion-content', 'blocks');

/**
 * The converter emits table blocks in Notion's *write* shape (rows nested under
 * `table.children`). Sidecars are consumed by NotionBlocks.astro, which reads
 * the Notion *read*-API shape: `table` holds only metadata and rows live at the
 * block's top-level `children`. Normalize so the reader finds the rows.
 */
function toReadShape(block: any): any {
  if (block?.type !== 'table') return block;
  const { children, ...tableMeta } = block.table ?? {};
  return { ...block, table: tableMeta, children: children ?? [] };
}
const extract: any[] = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'articles-en.json'), 'utf8')
);
const bySlug = new Map(extract.map((a) => [a.slug, a]));

// Affected = en article sidecars that still need repair: either they still
// hold the "[table content omitted]" placeholder, OR a prior pass wrote tables
// in the write-API shape (rows under `table.children`) the reader can't read.
const needsRepair = (raw: string): boolean => {
  if (raw.includes('table content omitted')) return true;
  return raw.includes('"table"') && /"table":\{[^}]*"children"/.test(raw);
};
const affected = readdirSync(BLOCKS)
  .filter((f) => f.startsWith('article-en-') && needsRepair(readFileSync(join(BLOCKS, f), 'utf8')))
  .map((f) => f.replace('article-en-', '').replace('.json', ''));

console.log(`${affected.length} article sidecars contain [table content omitted]${dryRun ? ' (dry run)' : ''}`);

let fixed = 0, noSource = 0, noTable = 0;
for (const slug of affected) {
  const article = bySlug.get(slug);
  if (!article || !article.bodyHtml) { noSource++; console.warn(`  ! no WP source for ${slug}`); continue; }
  if (!article.bodyHtml.includes('<table')) {
    // Placeholder but no table in current HTML (WP removed it). Regenerating
    // still clears the stale placeholder text, so proceed.
    noTable++;
  }
  const blocks = htmlToNotionBlocks(article.bodyHtml).map(toReadShape);
  const tables = blocks.filter((b: any) => b.type === 'table').length;
  const stillOmitted = JSON.stringify(blocks).includes('table content omitted');
  if (stillOmitted) { console.error(`  ✗ ${slug}: still has placeholder after convert — skipping`); continue; }

  const file = join(BLOCKS, `article-en-${slug}.json`);
  if (!dryRun) writeFileSync(file, JSON.stringify(blocks));
  fixed++;
  console.log(`  ${dryRun ? '[dry-run] ' : '✓ '}${slug} — ${blocks.length} blocks, ${tables} table(s)`);
}

console.log(`\nDone: ${fixed} sidecars regenerated${noTable ? `, ${noTable} had no <table> (placeholder cleared anyway)` : ''}${noSource ? `, ${noSource} missing WP source` : ''}.`);
