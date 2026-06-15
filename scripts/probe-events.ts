import { getConnection } from './db.js';
const db = await getConnection();

console.log('── Raw event posts ──');
const [posts] = await db.query(`
  SELECT p.ID, p.post_title, p.post_status
  FROM wp_posts p WHERE p.post_type = 'event' ORDER BY p.ID
`);
for (const p of posts as any[]) {
  console.log(`  ${p.ID} ${p.post_status}: ${p.post_title}`);
}

console.log('\n── WPML coverage for events ──');
const [trans] = await db.query(`
  SELECT element_id, language_code, trid
  FROM wp_icl_translations
  WHERE element_type = 'post_event'
  ORDER BY trid, language_code
`);
for (const t of trans as any[]) {
  console.log(`  trid=${t.trid} lang=${t.language_code} post_id=${t.element_id}`);
}

await db.end();
