import { getConnection } from './db.js';
import { CONTENT_LANGUAGES } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

// Taxonomies are always extracted for every content language (they're small
// and shared across content types).
const LOCALES: string[] = [...CONTENT_LANGUAGES];

interface TermRow {
  id: number;
  trid: number | null;
  language: string;
  name: string;
  slug: string;
  color?: string | null;
  bgImageUrl?: string | null;
  iconUrl?: string | null;
  landingPage?: string | null;
}

/**
 * Pull terms for one taxonomy in one language, with WPML translation linking.
 * Joins wp_icl_translations on element_id = term_taxonomy_id (not term_id —
 * WPML keys taxonomy translations by term_taxonomy_id).
 */
async function fetchTerms(
  db: any,
  taxonomy: string,
  language: string,
  metaKeys: string[] = []
): Promise<TermRow[]> {
  const metaSelects = metaKeys
    .map(
      (k) =>
        `MAX(CASE WHEN tm.meta_key = '${k.replace(/[^a-z0-9_]/gi, '')}' THEN tm.meta_value END) AS ${k.replace(/[^a-z0-9_]/gi, '')}`
    )
    .join(',\n      ');

  const [rows] = await db.query(
    `SELECT
       t.term_id AS id,
       ic.trid AS trid,
       ic.language_code AS language,
       t.name,
       t.slug
       ${metaSelects ? ',' + metaSelects : ''}
     FROM wp_terms t
     JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
     JOIN wp_icl_translations ic
       ON ic.element_id = tt.term_taxonomy_id
       AND ic.element_type = ?
     ${metaKeys.length > 0 ? 'LEFT JOIN wp_termmeta tm ON t.term_id = tm.term_id' : ''}
     WHERE tt.taxonomy = ?
       AND ic.language_code = ?
     GROUP BY t.term_id, ic.trid, ic.language_code
     ORDER BY t.name`,
    [`tax_${taxonomy}`, taxonomy, language]
  );

  return rows as TermRow[];
}

/** Resolve a WP attachment ID to its public URL via wp_posts.guid. */
async function resolveAttachment(db: any, id: string | number | null): Promise<string | null> {
  if (!id) return null;
  const [rows] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [id]);
  return (rows as any[])[0]?.guid ?? null;
}

export async function extractTaxonomies() {
  const db = await getConnection();

  for (const taxonomy of ['tire-industry', 'tire-application', 'tire-type'] as const) {
    const allTerms: TermRow[] = [];

    for (const lang of LOCALES) {
      // Each taxonomy has its own ACF meta keys.
      let metaKeys: string[] = [];
      if (taxonomy === 'tire-industry') {
        metaKeys = ['industry_color', 'background_image_features_benefits', 'industry_landing_page'];
      } else if (taxonomy === 'tire-application') {
        metaKeys = ['taxonomy_application_icon'];
      }

      const terms = await fetchTerms(db, taxonomy, lang, metaKeys);

      // Resolve attachment IDs to URLs.
      for (const t of terms as any[]) {
        if (t.background_image_features_benefits) {
          t.bgImageUrl = await resolveAttachment(db, t.background_image_features_benefits);
          delete t.background_image_features_benefits;
        }
        if (t.taxonomy_application_icon) {
          t.iconUrl = await resolveAttachment(db, t.taxonomy_application_icon);
          delete t.taxonomy_application_icon;
        }
        if (t.industry_color) {
          t.color = t.industry_color;
          delete t.industry_color;
        }
        if (t.industry_landing_page) {
          t.landingPage = t.industry_landing_page;
          delete t.industry_landing_page;
        }
      }

      allTerms.push(...terms);
    }

    const fileMap: Record<string, string> = {
      'tire-industry': 'industries.json',
      'tire-application': 'applications.json',
      'tire-type': 'tire-types.json',
    };
    writeFileSync(join(OUT, fileMap[taxonomy]), JSON.stringify(allTerms, null, 2));
    console.log(`✓ Extracted ${allTerms.length} ${taxonomy} terms across ${LOCALES.length} locales`);
  }

  // Sizes are not translated (numeric strings); extract once for reference.
  const [sizes] = await db.query(`
    SELECT t.term_id AS id, t.name, t.slug
    FROM wp_terms t
    JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy = 'tire-size'
    ORDER BY t.name
  `);
  writeFileSync(join(OUT, 'sizes.json'), JSON.stringify(sizes, null, 2));
  console.log(`✓ Extracted ${(sizes as any[]).length} sizes (untranslated)`);

  await db.end();
}
