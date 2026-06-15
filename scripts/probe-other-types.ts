import { getConnection } from './db.js';

const db = await getConnection();

console.log('── event sample with all meta ──');
const [eventMeta] = await db.query(`
  SELECT pm.meta_key, pm.meta_value
  FROM wp_postmeta pm
  WHERE pm.post_id = (SELECT MIN(p.ID) FROM wp_posts p WHERE p.post_type = 'event' AND p.post_status = 'publish')
    AND pm.meta_key NOT LIKE '\\_%'
`);
for (const m of eventMeta as any[]) {
  const v = (m.meta_value ?? '').toString().slice(0, 100);
  console.log(`  ${m.meta_key}: ${v}`);
}

console.log('\n── product-sheet sample with all meta ──');
const [psMeta] = await db.query(`
  SELECT pm.meta_key, pm.meta_value
  FROM wp_postmeta pm
  WHERE pm.post_id = (
    SELECT p.ID FROM wp_posts p
    JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_product-sheet'
    WHERE p.post_type = 'product-sheet' AND p.post_status = 'publish' AND ic.language_code = 'en'
    LIMIT 1
  )
    AND pm.meta_key NOT LIKE '\\_%'
`);
for (const m of psMeta as any[]) {
  const v = (m.meta_value ?? '').toString().slice(0, 100);
  console.log(`  ${m.meta_key}: ${v}`);
}

console.log('\n── How are product-sheets linked to tires? ──');
// Check if there's a relation field. The tire post we extracted has `documents`
// pulled from `tire_documents_*` repeater. Let's verify what document IDs typically point to.
const [tireDocs] = await db.query(`
  SELECT pm.meta_value AS doc_id, p.post_title, p.post_type
  FROM wp_postmeta pm
  JOIN wp_posts p ON p.ID = pm.meta_value
  WHERE pm.meta_key LIKE 'tire_documents_%_tire_documents'
    AND pm.meta_value REGEXP '^[0-9]+$'
  LIMIT 10
`);
for (const d of tireDocs as any[]) {
  console.log(`  doc ${d.doc_id} → ${d.post_title} (${d.post_type})`);
}

console.log('\n── document_file resolution for product-sheet ──');
const [resolved] = await db.query(`
  SELECT p.ID, p.post_title, pm.meta_value AS file_id, att.guid
  FROM wp_posts p
  JOIN wp_postmeta pm ON pm.post_id = p.ID AND pm.meta_key = 'document_file'
  LEFT JOIN wp_posts att ON att.ID = pm.meta_value
  WHERE p.post_type = 'product-sheet' AND p.post_status = 'publish'
  LIMIT 5
`);
for (const r of resolved as any[]) {
  console.log(`  ${r.post_title} → file_id=${r.file_id} url=${r.guid}`);
}

console.log('\n── testimonial sample ──');
const [testMeta] = await db.query(`
  SELECT pm.meta_key, pm.meta_value
  FROM wp_postmeta pm
  WHERE pm.post_id = (
    SELECT p.ID FROM wp_posts p
    JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_testimonial'
    WHERE p.post_type = 'testimonial' AND p.post_status = 'publish' AND ic.language_code = 'en'
    LIMIT 1
  )
    AND pm.meta_key NOT LIKE '\\_%'
`);
for (const m of testMeta as any[]) {
  const v = (m.meta_value ?? '').toString().slice(0, 200);
  console.log(`  ${m.meta_key}: ${v}`);
}

await db.end();
