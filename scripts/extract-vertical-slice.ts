/**
 * Extract just the 5 vertical slice tires + their AR/ZH translations.
 *
 * Usage: npx tsx scripts/extract-vertical-slice.ts
 */
import { getConnection } from './db.js';
import { extractTires } from './extract-tires.js';
import { extractTablePressTables } from './extract-tablepress.js';
import { findTranslations } from './extract-translations.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

// 5 English tires selected for the vertical slice
const SLICE_IDS = [
  2571,  // MS401      — Mining
  2370,  // AGRIXTRA 65 — Agricultural
  2371,  // MS705      — Construction
  10705, // MS307      — Industrial & Forklift
  2420,  // MS930      — Forestry
];

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Vertical Slice Extraction');
  console.log('═══════════════════════════════════════\n');

  // 1. Extract English tires
  console.log('── English tires ──');
  const enTires = await extractTires(SLICE_IDS);

  // 2. Extract and link spec tables
  console.log('\n── Spec tables ──');
  const tables = await extractTablePressTables();
  for (const tire of enTires) {
    if (tire.tablepressTableId && tables.has(tire.tablepressTableId)) {
      tire.specTable = tables.get(tire.tablepressTableId);
    }
  }

  writeFileSync(join(OUT, 'slice-tires-en.json'), JSON.stringify(enTires, null, 2));
  console.log(`\n✓ Saved ${enTires.length} English tires to slice-tires-en.json`);

  // 3. Find and extract translations (AR-AE and ZH-HANS)
  console.log('\n── Translations ──');
  const links = await findTranslations(SLICE_IDS);

  // Filter to just ar-ae and zh-hans
  const targetLangs = ['ar-ae', 'ar', 'zh-hans'];
  const arIds = links.filter(l => l.languageCode === 'ar-ae' || l.languageCode === 'ar').map(l => l.translatedPostId);
  const zhIds = links.filter(l => l.languageCode === 'zh-hans').map(l => l.translatedPostId);

  // We may not have zh-hans — check what languages exist
  const allLangs = [...new Set(links.map(l => l.languageCode))];
  console.log(`Available translation languages: ${allLangs.join(', ')}`);

  if (arIds.length > 0) {
    const arTires = await extractTires(arIds);
    // Attach translation group info
    for (const tire of arTires) {
      const link = links.find(l => l.translatedPostId === tire.wpId);
      if (link) {
        tire.translationGroup = String(link.trid);
        tire.enPostId = link.enPostId;
        // Copy spec table from English tire
        const enTire = enTires.find(t => t.wpId === link.enPostId);
        if (enTire?.specTable) tire.specTable = enTire.specTable;
      }
    }
    writeFileSync(join(OUT, 'slice-tires-ar-ae.json'), JSON.stringify(arTires, null, 2));
    console.log(`✓ Saved ${arTires.length} Arabic tires to slice-tires-ar-ae.json`);
  } else {
    console.log('⚠ No Arabic (ar-ae) translations found');
  }

  if (zhIds.length > 0) {
    const zhTires = await extractTires(zhIds);
    for (const tire of zhTires) {
      const link = links.find(l => l.translatedPostId === tire.wpId);
      if (link) {
        tire.translationGroup = String(link.trid);
        tire.enPostId = link.enPostId;
        const enTire = enTires.find(t => t.wpId === link.enPostId);
        if (enTire?.specTable) tire.specTable = enTire.specTable;
      }
    }
    writeFileSync(join(OUT, 'slice-tires-zh-hans.json'), JSON.stringify(zhTires, null, 2));
    console.log(`✓ Saved ${zhTires.length} Chinese tires to slice-tires-zh-hans.json`);
  } else {
    // Try zh-hant as fallback
    const zhHantIds = links.filter(l => l.languageCode === 'zh-hant').map(l => l.translatedPostId);
    if (zhHantIds.length > 0) {
      console.log('⚠ No zh-hans found, using zh-hant (Traditional Chinese) as fallback');
      const zhTires = await extractTires(zhHantIds);
      for (const tire of zhTires) {
        const link = links.find(l => l.translatedPostId === tire.wpId);
        if (link) {
          tire.translationGroup = String(link.trid);
          tire.enPostId = link.enPostId;
          const enTire = enTires.find(t => t.wpId === link.enPostId);
          if (enTire?.specTable) tire.specTable = enTire.specTable;
        }
      }
      writeFileSync(join(OUT, 'slice-tires-zh-hant.json'), JSON.stringify(zhTires, null, 2));
      console.log(`✓ Saved ${zhTires.length} Traditional Chinese tires to slice-tires-zh-hant.json`);
    } else {
      console.log('⚠ No Chinese translations found');
    }
  }

  // 4. Also extract the English industries for these tires
  console.log('\n── Industries for selected tires ──');
  const db = await getConnection();
  const industryNames = new Set<string>();
  for (const tire of enTires) {
    for (const ind of tire.industries) {
      industryNames.add(ind.slug);
    }
  }

  const [indRows] = await db.query(`
    SELECT t.term_id AS id, t.name, t.slug,
      MAX(CASE WHEN tm.meta_key = 'industry_color' THEN tm.meta_value END) AS color,
      MAX(CASE WHEN tm.meta_key = 'background_image_features_benefits' THEN tm.meta_value END) AS bgImageId
    FROM wp_terms t
    JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
    LEFT JOIN wp_termmeta tm ON t.term_id = tm.term_id
    WHERE tt.taxonomy = 'tire-industry'
      AND t.slug IN (${[...industryNames].map(() => '?').join(',')})
    GROUP BY t.term_id
  `, [...industryNames]);

  // Resolve bg image URLs
  for (const ind of indRows as any[]) {
    if (ind.bgImageId) {
      const [rows] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [ind.bgImageId]);
      ind.bgImageUrl = (rows as any[])[0]?.guid ?? null;
    }
    delete ind.bgImageId;
  }

  writeFileSync(join(OUT, 'slice-industries.json'), JSON.stringify(indRows, null, 2));
  console.log(`✓ Saved ${(indRows as any[]).length} industries to slice-industries.json`);

  await db.end();

  console.log('\n═══════════════════════════════════════');
  console.log('  Vertical slice extraction complete!');
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
