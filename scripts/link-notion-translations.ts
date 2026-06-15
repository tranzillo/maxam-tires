/**
 * Walk every taxonomy database and link sibling rows via the `Translations`
 * self-relation. We already have the trid→{language: pageId} map from the
 * import step; this just patches each row's Translations to include its siblings.
 *
 * Run after import-taxonomies-to-notion.ts.
 *
 * Usage:
 *   npx tsx scripts/link-notion-translations.ts
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const map: Record<string, Record<string, Record<string, string>>> = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-tax-map.json'), 'utf8')
);

async function linkTaxonomy(taxKey: string) {
  const byTrid = map[taxKey] ?? {};
  console.log(`\n── ${taxKey}: ${Object.keys(byTrid).length} translation groups ──`);

  let success = 0;
  for (const [trid, byLang] of Object.entries(byTrid)) {
    const allPageIds = Object.values(byLang);
    if (allPageIds.length < 2) continue; // No siblings to link.

    for (const [lang, pageId] of Object.entries(byLang)) {
      const siblings = allPageIds.filter((id) => id !== pageId);
      try {
        await notion.pages.update({
          page_id: pageId,
          properties: {
            Translations: {
              relation: siblings.map((id) => ({ id })),
            },
          },
        });
        success++;
      } catch (err: any) {
        console.error(`  ✗ trid ${trid} ${lang}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  console.log(`  ✓ Linked ${success} ${taxKey} rows`);
}

async function main() {
  for (const taxKey of ['industries', 'applications', 'tireTypes']) {
    await linkTaxonomy(taxKey);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
