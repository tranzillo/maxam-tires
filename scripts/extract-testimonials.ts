/**
 * Extract testimonials with WPML translation linking.
 * Output: scripts/output/testimonials-<locale>.json
 */
import { getConnection } from './db.js';
import { resolveLanguages } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

interface Testimonial {
  wpId: number;
  trid: number;
  language: string;
  title: string;
  slug: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  authorCompany: string;
  publishedDate: string;
}

async function fetchTestimonials(db: any, language: string): Promise<Testimonial[]> {
  const [posts] = await db.query(
    `SELECT
       p.ID, p.post_title, p.post_name AS slug, p.post_date,
       ic.trid, ic.language_code AS language
     FROM wp_posts p
     JOIN wp_icl_translations ic
       ON ic.element_id = p.ID
       AND ic.element_type = 'post_testimonial'
     WHERE p.post_type = 'testimonial'
       AND p.post_status = 'publish'
       AND ic.language_code = ?
     ORDER BY p.post_title`,
    [language]
  );

  const out: Testimonial[] = [];

  for (const row of posts as any[]) {
    const [meta] = await db.query(
      `SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?`,
      [row.ID]
    );
    const m = new Map<string, string>();
    for (const r of meta as any[]) m.set(r.meta_key, r.meta_value);

    out.push({
      wpId: row.ID,
      trid: row.trid,
      language: row.language,
      title: row.post_title,
      slug: row.slug,
      quote: m.get('testimonial_text') ?? '',
      authorName: m.get('author_name') ?? '',
      authorTitle: m.get('author_title') ?? '',
      authorCompany: m.get('author_company') ?? '',
      publishedDate: row.post_date instanceof Date ? row.post_date.toISOString() : row.post_date,
    });
  }

  return out;
}

const db = await getConnection();
for (const locale of resolveLanguages(process.argv.slice(2))) {
  const items = await fetchTestimonials(db, locale);
  writeFileSync(join(OUT, `testimonials-${locale}.json`), JSON.stringify(items, null, 2));
  console.log(`✓ ${locale}: ${items.length} testimonials`);
}
await db.end();
