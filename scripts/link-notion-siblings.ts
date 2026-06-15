/**
 * Generic Translations sibling linker. Reads a trid → language → pageId map
 * and patches every page's `Translations` self-relation to include its
 * siblings in other languages.
 *
 * Usage:
 *   npx tsx scripts/link-notion-siblings.ts <type>
 *
 *   <type> matches a notion-<type>-map.json file in scripts/output/.
 *   Examples: products, articles, events, documents, testimonials
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const type = process.argv[2];
if (!type) {
  console.error('Usage: link-notion-siblings.ts <type>');
  process.exit(1);
}

const mapPath = join(import.meta.dirname, 'output', `notion-${type}-map.json`);
const map: Record<string, Record<string, string>> = JSON.parse(readFileSync(mapPath, 'utf8'));

console.log(`Linking ${Object.keys(map).length} ${type} translation groups...`);

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
        properties: { Translations: { relation: siblings.map((id) => ({ id })) } },
      });
      success++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ trid ${trid} ${lang}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
}

console.log(`✓ Linked ${success} ${type} rows (${failed} failed)`);
