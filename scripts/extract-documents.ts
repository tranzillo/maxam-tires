/**
 * Extract documents (product-sheets + brochures merged into one stream).
 * Each WP post has a `document_file` attachment ID resolving to a PDF URL.
 *
 * Output: scripts/output/documents-<locale>.json
 */
import { getConnection } from './db.js';
import { resolveLanguages } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

interface Document {
  wpId: number;
  trid: number;
  language: string;
  /** product-sheet | brochure */
  type: 'product-sheet' | 'brochure';
  title: string;
  slug: string;
  fileUrl: string | null;
  thumbnail: string | null;
  publishedDate: string;
}

async function fetchDocs(db: any, language: string): Promise<Document[]> {
  const [posts] = await db.query(
    `SELECT
       p.ID, p.post_type, p.post_title, p.post_name AS slug, p.post_date,
       ic.trid, ic.language_code AS language
     FROM wp_posts p
     JOIN wp_icl_translations ic
       ON ic.element_id = p.ID
       AND ic.element_type = CONCAT('post_', p.post_type)
     WHERE p.post_type IN ('product-sheet', 'brochure')
       AND p.post_status = 'publish'
       AND ic.language_code = ?
     ORDER BY p.post_title`,
    [language]
  );

  const docs: Document[] = [];

  for (const row of posts as any[]) {
    const [meta] = await db.query(
      `SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?`,
      [row.ID]
    );
    const m = new Map<string, string>();
    for (const r of meta as any[]) m.set(r.meta_key, r.meta_value);

    // Resolve document_file attachment to URL.
    let fileUrl: string | null = null;
    const fileId = m.get('document_file');
    if (fileId) {
      const [att] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [fileId]);
      fileUrl = (att as any[])[0]?.guid ?? null;
    }

    // Thumbnail (some product-sheets have a featured image preview)
    let thumbnail: string | null = null;
    const thumbId = m.get('_thumbnail_id');
    if (thumbId) {
      const [att] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [thumbId]);
      thumbnail = (att as any[])[0]?.guid ?? null;
    }

    docs.push({
      wpId: row.ID,
      trid: row.trid,
      language: row.language,
      type: row.post_type,
      title: row.post_title,
      slug: row.slug,
      fileUrl,
      thumbnail,
      publishedDate: row.post_date instanceof Date ? row.post_date.toISOString() : row.post_date,
    });
  }

  return docs;
}

const db = await getConnection();
for (const locale of resolveLanguages(process.argv.slice(2))) {
  const docs = await fetchDocs(db, locale);
  writeFileSync(join(OUT, `documents-${locale}.json`), JSON.stringify(docs, null, 2));
  const byType = docs.reduce<Record<string, number>>((a, d) => {
    a[d.type] = (a[d.type] || 0) + 1;
    return a;
  }, {});
  console.log(
    `✓ ${locale}: ${docs.length} documents (${Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(', ')})`
  );
}
await db.end();
