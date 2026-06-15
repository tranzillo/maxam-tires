/**
 * Add a `Documents` relation property to the Products data source, then
 * patch each product page to point at the same-language document pages.
 *
 * Resolution: each tire JSON entry has a `documents` array with WP IDs.
 * Each Notion document page stores its `WP ID` as a property — we query
 * the documents data source to build a wpId → pageId lookup per language,
 * then update each product.
 *
 * Usage:
 *   npx tsx scripts/link-products-to-documents.ts
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);

// Step 1: ensure the Documents relation property exists on Products.
console.log('Adding Documents relation property to Products...');
await (notion as any).dataSources.update({
  data_source_id: ids.productsDataSourceId,
  properties: {
    Documents: {
      relation: { data_source_id: ids.documentsDataSourceId, single_property: {} },
    },
  },
});
console.log('  ✓ Added\n');

// Step 2: build wpId → pageId lookup from the Documents DB, per language.
console.log('Building document lookup map...');
const docLookup: Record<string, Record<number, string>> = {
  en: {},
  'ar-ae': {},
  'zh-hant': {},
};
let cursor: string | undefined;
do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.documentsDataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    const lang = page.properties?.Language?.select?.name;
    const wpId = page.properties?.['WP ID']?.number;
    if (lang && wpId && docLookup[lang]) {
      docLookup[lang][wpId] = page.id;
    }
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

for (const [lang, m] of Object.entries(docLookup)) {
  console.log(`  ${lang}: ${Object.keys(m).length} documents`);
}

// Step 3: walk each product page, look up its tire JSON entry by WP ID,
// resolve the document WP IDs to Notion page IDs, and patch.
console.log('\nLinking product → documents...');

let success = 0;
let skipped = 0;
let failed = 0;

for (const locale of ['en', 'ar-ae', 'zh-hant']) {
  const tires = JSON.parse(
    readFileSync(join(import.meta.dirname, 'output', `tires-${locale}.json`), 'utf8')
  );

  // Build a wpId → tire lookup for this locale.
  const tireByWpId = new Map<number, any>();
  for (const t of tires) tireByWpId.set(t.wpId, t);

  // Walk all products in this locale via Notion.
  let pCursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: ids.productsDataSourceId,
      filter: { property: 'Language', select: { equals: locale } },
      start_cursor: pCursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const wpId = page.properties?.['WP ID']?.number;
      const tire = tireByWpId.get(wpId);
      if (!tire || !Array.isArray(tire.documents) || tire.documents.length === 0) {
        skipped++;
        continue;
      }
      const relations = tire.documents
        .map((d: any) => docLookup[locale]?.[d.wpId])
        .filter((id: string | undefined) => Boolean(id))
        .map((id: string) => ({ id }));
      if (relations.length === 0) {
        skipped++;
        continue;
      }
      try {
        await notion.pages.update({
          page_id: page.id,
          properties: { Documents: { relation: relations } },
        });
        success++;
      } catch (err: any) {
        failed++;
        console.error(`  ✗ ${page.id} (${tire.title}): ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    pCursor = res.has_more ? res.next_cursor : undefined;
  } while (pCursor);
}

console.log(`\nDone: ${success} linked, ${skipped} skipped, ${failed} failed`);
