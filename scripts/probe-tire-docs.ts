import { getConnection } from './db.js';
const db = await getConnection();

// Find any tire that has a tire_documents meta and probe its structure
const [meta] = await db.query(`
  SELECT pm.post_id, p.post_title, pm.meta_key, pm.meta_value
  FROM wp_postmeta pm
  JOIN wp_posts p ON p.ID = pm.post_id
  WHERE pm.meta_key LIKE 'tire_documents%'
  LIMIT 30
`);
for (const m of meta as any[]) {
  console.log(`  ${m.post_id} ${m.post_title}: ${m.meta_key} = ${m.meta_value}`);
}

await db.end();
