import { getConnection } from './db.js';
import { extractTires } from './extract-tires.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

interface TranslationLink {
  trid: number;
  enPostId: number;
  translatedPostId: number;
  languageCode: string;
}

/**
 * Get tire counts per language to understand true content volume.
 */
export async function getTireCounts() {
  const db = await getConnection();
  const [rows] = await db.query(`
    SELECT language_code, COUNT(*) AS count
    FROM wp_icl_translations
    WHERE element_type = 'post_tire'
    GROUP BY language_code
    ORDER BY count DESC
  `);
  await db.end();
  console.log('Tire counts by language:');
  for (const row of rows as any[]) {
    console.log(`  ${row.language_code}: ${row.count}`);
  }
  return rows;
}

/**
 * Given English tire post IDs, find their translations in AR and ZH-Hans.
 */
export async function findTranslations(enPostIds: number[]): Promise<TranslationLink[]> {
  const db = await getConnection();
  const links: TranslationLink[] = [];

  for (const enId of enPostIds) {
    // Find the trid for this English post
    const [tridRows] = await db.query(
      `SELECT trid FROM wp_icl_translations
       WHERE element_id = ? AND element_type = 'post_tire'`,
      [enId]
    );
    const trid = (tridRows as any[])[0]?.trid;
    if (!trid) continue;

    // Find translations in target languages
    const [transRows] = await db.query(
      `SELECT element_id, language_code FROM wp_icl_translations
       WHERE trid = ? AND element_type = 'post_tire' AND language_code != 'en'`,
      [trid]
    );

    for (const row of transRows as any[]) {
      links.push({
        trid,
        enPostId: enId,
        translatedPostId: row.element_id,
        languageCode: row.language_code,
      });
    }
  }

  await db.end();
  return links;
}

/**
 * Extract translated tire data for given English post IDs.
 * Outputs separate JSON files per language.
 */
export async function extractTranslatedTires(enPostIds: number[]) {
  const links = await findTranslations(enPostIds);

  // Group by language
  const byLang = new Map<string, number[]>();
  for (const link of links) {
    const existing = byLang.get(link.languageCode) ?? [];
    existing.push(link.translatedPostId);
    byLang.set(link.languageCode, existing);
  }

  console.log(`Found translations:`);
  for (const [lang, ids] of byLang) {
    console.log(`  ${lang}: ${ids.length} tires`);
  }

  // Extract each language's tire data
  // Map WP language codes to our locale codes
  const langMap: Record<string, string> = {
    ar: 'ar-ae',
    'zh-hans': 'zh-hans',
    'zh-hant': 'zh-hant',
    es: 'es',
    de: 'de',
    fr: 'fr',
    it: 'it',
    ja: 'ja',
  };

  for (const [wpLang, postIds] of byLang) {
    const tires = await extractTires(postIds);

    // Add translation group info
    for (const tire of tires) {
      const link = links.find((l) => l.translatedPostId === tire.wpId);
      if (link) {
        tire.translationGroup = String(link.trid);
        tire.enPostId = link.enPostId;
      }
    }

    const locale = langMap[wpLang] ?? wpLang;
    const filename = `tires-${locale}.json`;
    writeFileSync(join(OUT, filename), JSON.stringify(tires, null, 2));
    console.log(`✓ Extracted ${tires.length} tires for ${locale}`);
  }

  // Also add translation group to the English tires output
  return links;
}
