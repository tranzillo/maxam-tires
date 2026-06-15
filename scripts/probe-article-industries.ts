/**
 * Check whether news/post entries in WordPress have industry associations.
 * Industries could be attached via:
 *   - tire-industry taxonomy (the same taxonomy used for products)
 *   - a custom field referencing an industry term ID
 *   - the `category` taxonomy populated with real values (vs. just "Uncategorized")
 */
import { getConnection } from './db.js';

const db = await getConnection();

console.log('── tire-industry term assignments per post type ──');
const [byType] = await db.query(`
  SELECT p.post_type, COUNT(*) AS count
  FROM wp_term_relationships tr
  JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
  JOIN wp_posts p ON tr.object_id = p.ID
  WHERE tt.taxonomy = 'tire-industry'
    AND p.post_status = 'publish'
  GROUP BY p.post_type
  ORDER BY count DESC
`);
for (const row of byType as any[]) {
  console.log(`  ${row.post_type}: ${row.count}`);
}

console.log('\n── Sample news posts with tire-industry tags ──');
const [tagged] = await db.query(`
  SELECT p.ID, p.post_title, t.name AS industry_name, t.slug AS industry_slug
  FROM wp_posts p
  JOIN wp_term_relationships tr ON tr.object_id = p.ID
  JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
  JOIN wp_terms t ON tt.term_id = t.term_id
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_news'
  WHERE p.post_type = 'news'
    AND p.post_status = 'publish'
    AND tt.taxonomy = 'tire-industry'
    AND ic.language_code = 'en'
  ORDER BY p.post_title
  LIMIT 15
`);
console.log(`  Sample (showing up to 15):`);
for (const row of tagged as any[]) {
  console.log(`  - [${row.industry_slug}] ${row.post_title}`);
}

console.log('\n── Same for blog posts (post_post) ──');
const [blogTagged] = await db.query(`
  SELECT p.ID, p.post_title, t.name AS industry_name, t.slug AS industry_slug
  FROM wp_posts p
  JOIN wp_term_relationships tr ON tr.object_id = p.ID
  JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
  JOIN wp_terms t ON tt.term_id = t.term_id
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_post'
  WHERE p.post_type = 'post'
    AND p.post_status = 'publish'
    AND tt.taxonomy = 'tire-industry'
    AND ic.language_code = 'en'
  ORDER BY p.post_title
  LIMIT 15
`);
console.log(`  Sample (showing up to 15):`);
for (const row of blogTagged as any[]) {
  console.log(`  - [${row.industry_slug}] ${row.post_title}`);
}

console.log('\n── Total English news/post coverage ──');
const [coverage] = await db.query(`
  SELECT
    p.post_type,
    COUNT(DISTINCT p.ID) AS total,
    COUNT(DISTINCT CASE WHEN tt.taxonomy = 'tire-industry' THEN p.ID END) AS with_industry
  FROM wp_posts p
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
  LEFT JOIN wp_term_relationships tr ON tr.object_id = p.ID
  LEFT JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
  WHERE p.post_type IN ('news', 'post')
    AND p.post_status = 'publish'
    AND ic.language_code = 'en'
  GROUP BY p.post_type
`);
for (const row of coverage as any[]) {
  console.log(`  ${row.post_type}: ${row.with_industry}/${row.total} have a tire-industry tag`);
}

console.log('\n── Other taxonomies attached to news/post ──');
const [otherTax] = await db.query(`
  SELECT p.post_type, tt.taxonomy, COUNT(DISTINCT p.ID) AS posts
  FROM wp_posts p
  JOIN wp_term_relationships tr ON tr.object_id = p.ID
  JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
  WHERE p.post_type IN ('news', 'post')
    AND p.post_status = 'publish'
    AND tt.taxonomy NOT IN ('translation_priority', 'language')
  GROUP BY p.post_type, tt.taxonomy
  ORDER BY p.post_type, posts DESC
`);
for (const row of otherTax as any[]) {
  console.log(`  ${row.post_type} × ${row.taxonomy}: ${row.posts} posts`);
}

await db.end();
