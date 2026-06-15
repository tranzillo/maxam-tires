/**
 * Main extraction orchestrator.
 * Pulls all data from the Local WP MySQL database and outputs JSON files
 * to scripts/output/ for the Notion import pipeline.
 *
 * Usage:
 *   npx tsx scripts/extract-all.ts
 *
 * Prerequisites:
 *   - Local by WP Engine site must be running (MySQL on port 10017)
 */
import { extractTaxonomies } from './extract-taxonomies.js';
import { extractAndSaveTires } from './extract-tires.js';
import { extractTablePressTables } from './extract-tablepress.js';
import { getTireCounts } from './extract-translations.js';
import { resolveLanguages } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

// WPML content-language codes — these become the filename suffixes in
// scripts/output/. Defaults to all content languages; pass codes on the CLI
// to extract a subset, e.g. `npx tsx scripts/extract-all.ts de`.
const LOCALES = resolveLanguages(process.argv.slice(2));

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  MAXAM WP → Notion Data Extraction');
  console.log('═══════════════════════════════════════\n');

  console.log('── Step 1: Tire counts by language ──');
  await getTireCounts();
  console.log();

  console.log('── Step 2: Taxonomies ──');
  await extractTaxonomies();
  console.log();

  console.log('── Step 3: TablePress spec tables ──');
  const tables = await extractTablePressTables();
  console.log();

  console.log('── Step 4: Tires per locale ──');
  for (const locale of LOCALES) {
    const tires = await extractAndSaveTires(locale);

    // Attach spec tables inline so the Notion importer has everything in one file.
    let linked = 0;
    for (const tire of tires) {
      if (tire.tablepressTableId && tables.has(tire.tablepressTableId)) {
        tire.specTable = tables.get(tire.tablepressTableId);
        linked++;
      }
    }
    writeFileSync(join(OUT, `tires-${locale}.json`), JSON.stringify(tires, null, 2));
    console.log(`  └─ Linked ${linked}/${tires.length} spec tables for ${locale}`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  Extraction complete!');
  console.log('  Check scripts/output/ for JSON files');
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
