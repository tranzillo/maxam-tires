/**
 * Add an `Industries` relation property to the Articles data source, then
 * walk every article in Notion and set its industries based on the
 * `industries` field in articles-<locale>.json (derived from WP categories).
 *
 * Idempotent: re-running updates each row to match the current extracted
 * data. Safe to run after every WP backup change.
 *
 * Usage:
 *   npx tsx scripts/backfill-article-industries.ts
 *   npx tsx scripts/backfill-article-industries.ts --dry-run
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);

// ── 1) Ensure the Industries relation property exists on Articles ──────
console.log('Ensuring Articles.Industries relation property...');
if (!DRY_RUN) {
  await (notion as any).dataSources.update({
    data_source_id: ids.articlesDataSourceId,
    properties: {
      Industries: {
        relation: {
          data_source_id: ids.industriesDataSourceId,
          single_property: {},
        },
      },
    },
  });
  console.log('  ✓ Property ensured\n');
} else {
  console.log('  [dry-run] would add Industries relation\n');
}

// ── 2) Build slug → pageId map for Industries (per locale) ──────────────
console.log('Loading industry slug → pageId map...');
const indSlugToPageId: Record<string, Record<string, string>> = { en: {}, 'ar-ae': {}, 'zh-hant': {} };
let cursor: string | undefined;
do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.industriesDataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    const lang = page.properties?.Language?.select?.name;
    const slugRT = page.properties?.Slug?.rich_text ?? [];
    const slug = slugRT.map((t: any) => t.plain_text).join('');
    if (lang && slug && indSlugToPageId[lang]) indSlugToPageId[lang][slug] = page.id;
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);
for (const [lang, m] of Object.entries(indSlugToPageId)) {
  console.log(`  ${lang}: ${Object.keys(m).length} industries`);
}
console.log();

// ── 3) Build wpId → industries[] map from the extracted JSON ───────────
console.log('Loading article industry tags from extracted JSONs...');
const wpIdToIndustries = new Map<number, string[]>();
for (const locale of ['en', 'ar-ae', 'zh-hant']) {
  try {
    const rows: any[] = JSON.parse(
      readFileSync(join(import.meta.dirname, 'output', `articles-${locale}.json`), 'utf8')
    );
    for (const r of rows) {
      if (Array.isArray(r.industries) && r.industries.length > 0) {
        wpIdToIndustries.set(r.wpId, r.industries);
      }
    }
  } catch {}
}
console.log(`  ${wpIdToIndustries.size} articles have at least one industry tag\n`);

// ── 4) Walk every article in Notion, patch industries relation ─────────
console.log('Patching Notion article rows...');
let cursor2: string | undefined;
let updated = 0;
let skipped = 0;
let cleared = 0;

do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.articlesDataSourceId,
    start_cursor: cursor2,
    page_size: 100,
  });
  for (const page of res.results) {
    const wpId = page.properties?.['WP ID']?.number;
    const lang = page.properties?.Language?.select?.name ?? 'en';
    if (wpId == null) {
      skipped++;
      continue;
    }
    const industrySlugs = wpIdToIndustries.get(wpId) ?? [];

    // Look up the industry pageIds in this article's locale.
    const slugMap = indSlugToPageId[lang] ?? {};
    const relation = industrySlugs
      .map((s) => slugMap[s])
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id }));

    // Only patch if there's something to set OR existing industries to clear.
    const existing = page.properties?.Industries?.relation ?? [];
    const sameLength = existing.length === relation.length;
    const sameIds = sameLength && existing.every((e: any, i: number) => e.id === relation[i].id);
    if (sameIds && relation.length === 0) {
      skipped++;
      continue;
    }
    if (sameIds && relation.length > 0) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] wpId=${wpId} lang=${lang} → ${industrySlugs.join(',') || '(empty)'}`);
      updated++;
      continue;
    }

    try {
      await notion.pages.update({
        page_id: page.id,
        properties: { Industries: { relation } },
      });
      updated++;
      if (relation.length === 0) cleared++;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err: any) {
      console.error(`  ✗ wpId=${wpId}: ${err.message}`);
    }
  }
  cursor2 = res.has_more ? res.next_cursor : undefined;
} while (cursor2);

console.log(`\nDone: ${updated} updated, ${skipped} unchanged, ${cleared} explicitly cleared`);
