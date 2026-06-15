/**
 * Extract events with WPML translation linking.
 * Output: scripts/output/events-<locale>.json
 */
import { getConnection } from './db.js';
import { resolveLanguages } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

interface Event {
  wpId: number;
  trid: number;
  language: string;
  title: string;
  slug: string;
  bodyHtml: string;
  startDate: string | null;
  endDate: string | null;
  publishedDate: string;
  featuredImage: string | null;
  /** WP ids of related tires (from `tire` repeater) */
  relatedTireIds: number[];
  /** WP ids of related articles (from `resources` repeater) */
  relatedArticleIds: number[];
}

function unwrapAcfBlock(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/<!--\s*wp:acf\/block-post-content\s+(\{[\s\S]*?\})\s*\/?-->/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (typeof parsed?.data?.content === 'string') return parsed.data.content;
    } catch {}
  }
  return raw.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<pre>[\s\S]*?<\/pre>/g, '').trim();
}

async function fetchEvents(db: any, language: string): Promise<Event[]> {
  const [posts] = await db.query(
    `SELECT
       p.ID, p.post_title, p.post_name AS slug, p.post_content, p.post_date,
       ic.trid, ic.language_code AS language
     FROM wp_posts p
     JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = 'post_event'
     WHERE p.post_type = 'event' AND p.post_status = 'publish' AND ic.language_code = ?
     ORDER BY p.post_date DESC`,
    [language]
  );

  const events: Event[] = [];

  for (const row of posts as any[]) {
    const [meta] = await db.query(
      `SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?`,
      [row.ID]
    );
    const m = new Map<string, string>();
    for (const r of meta as any[]) m.set(r.meta_key, r.meta_value);

    // Featured image (_thumbnail_id is a hidden field)
    let featuredImage: string | null = null;
    const thumbId = m.get('_thumbnail_id');
    if (thumbId) {
      const [att] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [thumbId]);
      featuredImage = (att as any[])[0]?.guid ?? null;
    }

    // Related tires (ACF repeater)
    const tireCount = parseInt(m.get('tire') ?? '0', 10);
    const relatedTireIds: number[] = [];
    for (let i = 0; i < tireCount; i++) {
      const v = m.get(`tire_${i}_tire`);
      if (v) {
        const id = parseInt(v, 10);
        if (id) relatedTireIds.push(id);
      }
    }

    // Related articles (ACF repeater on `resources`)
    const resCount = parseInt(m.get('resources') ?? '0', 10);
    const relatedArticleIds: number[] = [];
    for (let i = 0; i < resCount; i++) {
      const v = m.get(`resources_${i}_resource`);
      if (v) {
        const id = parseInt(v, 10);
        if (id) relatedArticleIds.push(id);
      }
    }

    events.push({
      wpId: row.ID,
      trid: row.trid,
      language: row.language,
      title: row.post_title,
      slug: row.slug,
      bodyHtml: unwrapAcfBlock(row.post_content ?? ''),
      startDate: m.get('event_start_date') ?? null,
      endDate: m.get('event_end_date') ?? null,
      publishedDate: row.post_date instanceof Date ? row.post_date.toISOString() : row.post_date,
      featuredImage,
      relatedTireIds,
      relatedArticleIds,
    });
  }

  return events;
}

const db = await getConnection();
for (const locale of resolveLanguages(process.argv.slice(2))) {
  const events = await fetchEvents(db, locale);
  writeFileSync(join(OUT, `events-${locale}.json`), JSON.stringify(events, null, 2));
  console.log(`✓ ${locale}: ${events.length} events`);
}
await db.end();
