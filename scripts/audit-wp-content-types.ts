/**
 * Audit script: enumerate every content type in WordPress and characterize
 * its volume, ACF fields, taxonomies, and translation status.
 *
 * This runs once before designing additional Notion databases.
 *
 * Usage:
 *   npx tsx scripts/audit-wp-content-types.ts
 */
import { getConnection } from './db.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output', 'wp-content-audit.json');

async function main() {
  const db = await getConnection();

  // 1) All published post types and their counts
  const [postTypes] = await db.query(`
    SELECT post_type, COUNT(*) AS count
    FROM wp_posts
    WHERE post_status = 'publish' AND post_type NOT IN ('revision', 'auto-draft', 'nav_menu_item', 'wp_navigation', 'oembed_cache')
    GROUP BY post_type
    ORDER BY count DESC
  `);

  // 2) WPML coverage per post type
  const [wpmlCoverage] = await db.query(`
    SELECT element_type, language_code, COUNT(*) AS count
    FROM wp_icl_translations
    WHERE element_type LIKE 'post_%'
    GROUP BY element_type, language_code
    ORDER BY element_type, count DESC
  `);

  // 3) All taxonomies and their term counts
  const [taxonomies] = await db.query(`
    SELECT taxonomy, COUNT(*) AS term_count
    FROM wp_term_taxonomy
    GROUP BY taxonomy
    ORDER BY term_count DESC
  `);

  // 4) ACF field groups by location (which post type uses which fields)
  const [acfGroups] = await db.query(`
    SELECT p.ID, p.post_title, p.post_excerpt
    FROM wp_posts p
    WHERE p.post_type = 'acf-field-group' AND p.post_status = 'publish'
  `);

  // 5) For each non-tire content type, sample one post and list its meta keys
  const audit: any = {
    postTypes,
    wpmlCoverage,
    taxonomies,
    acfFieldGroups: (acfGroups as any[]).map((g) => ({
      title: g.post_title,
      location: g.post_excerpt,
    })),
    samplesByType: {} as Record<string, any>,
  };

  for (const pt of postTypes as any[]) {
    if (['attachment', 'tire'].includes(pt.post_type)) continue;
    const [samples] = await db.query(
      `SELECT ID, post_title, post_name FROM wp_posts
       WHERE post_type = ? AND post_status = 'publish'
       ORDER BY ID ASC LIMIT 1`,
      [pt.post_type]
    );
    const sample = (samples as any[])[0];
    if (!sample) continue;

    // MySQL workaround: subquery with LIMIT not allowed in IN clause —
    // wrap in a derived table.
    const [metaKeys] = await db.query(
      `SELECT DISTINCT meta_key FROM wp_postmeta
       WHERE post_id IN (
         SELECT ID FROM (
           SELECT ID FROM wp_posts WHERE post_type = ? AND post_status = 'publish' LIMIT 5
         ) AS sub
       )
       ORDER BY meta_key`,
      [pt.post_type]
    );

    const [taxList] = await db.query(
      `SELECT DISTINCT tt.taxonomy
       FROM wp_term_relationships tr
       JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
       JOIN wp_posts p ON tr.object_id = p.ID
       WHERE p.post_type = ?`,
      [pt.post_type]
    );

    audit.samplesByType[pt.post_type] = {
      total: pt.count,
      sampleId: sample.ID,
      sampleTitle: sample.post_title,
      sampleSlug: sample.post_name,
      taxonomies: (taxList as any[]).map((t) => t.taxonomy),
      metaKeys: (metaKeys as any[]).map((m) => m.meta_key).filter((k) => !k.startsWith('_')),
      hiddenMetaKeys: (metaKeys as any[]).map((m) => m.meta_key).filter((k) => k.startsWith('_')),
    };
  }

  await db.end();

  writeFileSync(OUT, JSON.stringify(audit, null, 2));

  console.log('═══ WordPress Content Audit ═══\n');
  console.log('Published post counts by type:');
  for (const pt of postTypes as any[]) {
    console.log(`  ${pt.post_type}: ${pt.count}`);
  }

  console.log('\nWPML coverage by post type:');
  const groupedByType: Record<string, string[]> = {};
  for (const w of wpmlCoverage as any[]) {
    groupedByType[w.element_type] = groupedByType[w.element_type] || [];
    groupedByType[w.element_type].push(`${w.language_code}:${w.count}`);
  }
  for (const [type, langs] of Object.entries(groupedByType)) {
    console.log(`  ${type}: ${langs.join(', ')}`);
  }

  console.log('\nTaxonomies:');
  for (const t of taxonomies as any[]) {
    console.log(`  ${t.taxonomy}: ${t.term_count} terms`);
  }

  console.log(`\nFull audit written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
