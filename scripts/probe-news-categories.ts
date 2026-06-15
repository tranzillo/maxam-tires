import { getConnection } from './db.js';

const db = await getConnection();

console.log('── All `category` terms used by news/post ──');
const [rows] = await db.query(`
  SELECT t.name, t.slug, COUNT(DISTINCT p.ID) AS posts, p.post_type
  FROM wp_terms t
  JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
  JOIN wp_term_relationships tr ON tr.term_taxonomy_id = tt.term_taxonomy_id
  JOIN wp_posts p ON tr.object_id = p.ID
  WHERE tt.taxonomy = 'category'
    AND p.post_status = 'publish'
    AND p.post_type IN ('news', 'post')
  GROUP BY t.term_id, p.post_type
  ORDER BY posts DESC
`);
for (const r of rows as any[]) {
  console.log(`  ${r.post_type} | ${r.name} (${r.slug}): ${r.posts}`);
}

console.log('\n── How many EN news/post have a non-Uncategorized category? ──');
const [stats] = await db.query(`
  SELECT
    p.post_type,
    COUNT(DISTINCT p.ID) AS total,
    COUNT(DISTINCT CASE WHEN t.slug NOT IN ('uncategorized', 'sin-categorizar') AND t.slug NOT LIKE 'uncategorized-%' THEN p.ID END) AS with_real_category
  FROM wp_posts p
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
  LEFT JOIN wp_term_relationships tr ON tr.object_id = p.ID
  LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'category'
  LEFT JOIN wp_terms t ON tt.term_id = t.term_id
  WHERE p.post_type IN ('news', 'post')
    AND p.post_status = 'publish'
    AND ic.language_code = 'en'
  GROUP BY p.post_type
`);
for (const r of stats as any[]) {
  console.log(`  ${r.post_type}: ${r.with_real_category}/${r.total} have a non-Uncategorized category`);
}

await db.end();
