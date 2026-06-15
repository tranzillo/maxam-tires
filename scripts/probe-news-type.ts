import { getConnection } from './db.js';

const db = await getConnection();

console.log('── news-type taxonomy terms ──');
const [terms] = await db.query(`
  SELECT t.term_id, t.name, t.slug, COUNT(tr.object_id) AS post_count
  FROM wp_terms t
  JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
  LEFT JOIN wp_term_relationships tr ON tr.term_taxonomy_id = tt.term_taxonomy_id
  WHERE tt.taxonomy = 'news-type'
  GROUP BY t.term_id
`);
for (const t of terms as any[]) {
  console.log(`  ${t.name} (${t.slug}): ${t.post_count} posts`);
}

console.log('\n── category taxonomy terms (used by post + news) ──');
const [cats] = await db.query(`
  SELECT t.name, t.slug, tt.taxonomy, COUNT(tr.object_id) AS post_count
  FROM wp_terms t
  JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
  LEFT JOIN wp_term_relationships tr ON tr.term_taxonomy_id = tt.term_taxonomy_id
  WHERE tt.taxonomy = 'category'
  GROUP BY t.term_id
  ORDER BY post_count DESC
`);
for (const t of cats as any[]) {
  console.log(`  ${t.name} (${t.slug}): ${t.post_count}`);
}

console.log('\n── post_content presence in news ──');
const [contentStats] = await db.query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN post_content IS NULL OR post_content = '' THEN 1 ELSE 0 END) AS is_empty,
    SUM(CASE WHEN LENGTH(post_content) > 0 AND LENGTH(post_content) < 100 THEN 1 ELSE 0 END) AS tiny,
    SUM(CASE WHEN LENGTH(post_content) >= 100 THEN 1 ELSE 0 END) AS substantial,
    AVG(LENGTH(post_content)) AS avg_length
  FROM wp_posts p
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_news'
  WHERE p.post_type = 'news' AND p.post_status = 'publish' AND ic.language_code = 'en'
`);
console.log(contentStats);

console.log('\n── post_content presence in posts (blog) ──');
const [postStats] = await db.query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN post_content IS NULL OR post_content = '' THEN 1 ELSE 0 END) AS is_empty,
    SUM(CASE WHEN LENGTH(post_content) > 0 AND LENGTH(post_content) < 100 THEN 1 ELSE 0 END) AS tiny,
    SUM(CASE WHEN LENGTH(post_content) >= 100 THEN 1 ELSE 0 END) AS substantial,
    AVG(LENGTH(post_content)) AS avg_length
  FROM wp_posts p
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_post'
  WHERE p.post_type = 'post' AND p.post_status = 'publish' AND ic.language_code = 'en'
`);
console.log(postStats);

console.log('\n── article_link sampling (news) ──');
const [links] = await db.query(`
  SELECT p.post_title, pm.meta_value AS link
  FROM wp_posts p
  JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'article_link'
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_news'
  WHERE p.post_type = 'news' AND p.post_status = 'publish' AND ic.language_code = 'en'
    AND pm.meta_value != ''
  LIMIT 5
`);
for (const l of links as any[]) {
  console.log(`  ${l.post_title} → ${l.link}`);
}

console.log('\n── How many news have an external article_link vs internal content? ──');
const [linkStats] = await db.query(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN pm.meta_value IS NOT NULL AND pm.meta_value != '' THEN 1 ELSE 0 END) AS with_link
  FROM wp_posts p
  LEFT JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'article_link'
  JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_news'
  WHERE p.post_type = 'news' AND p.post_status = 'publish' AND ic.language_code = 'en'
`);
console.log(linkStats);

await db.end();
