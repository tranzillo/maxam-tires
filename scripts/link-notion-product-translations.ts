/**
 * Link sibling product rows via the `Translations` self-relation.
 * Run after import-products-to-notion.ts has produced notion-product-map.json
 * for all locales.
 *
 * Usage:
 *   npx tsx scripts/link-notion-product-translations.ts
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const map: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-product-map.json'), 'utf8')
);

console.log(`Linking ${Object.keys(map).length} product translation groups...`);

let success = 0;
let failed = 0;

for (const [trid, byLang] of Object.entries(map)) {
  const all = Object.values(byLang);
  if (all.length < 2) continue;

  for (const [lang, pageId] of Object.entries(byLang)) {
    const siblings = all.filter((id) => id !== pageId);
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          Translations: { relation: siblings.map((id) => ({ id })) },
        },
      });
      success++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ trid ${trid} ${lang}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
}

console.log(`✓ Linked ${success} product rows (${failed} failed)`);
