/**
 * Extract articles (news + blog) from WordPress, merged into one
 * canonical shape. WP stores them in two post types:
 *   - `news` with `news-type` taxonomy of `press-release` or `in-the-news`
 *   - `post` (regular blog posts)
 *
 * Output: scripts/output/articles-<locale>.json — one entry per (article × locale).
 */
import { getConnection } from './db.js';
import { resolveLanguages } from './content-languages.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

type ArticleType = 'blog' | 'press-release' | 'in-the-news';

interface Article {
  wpId: number;
  trid: number;
  language: string;
  type: ArticleType;
  title: string;
  slug: string;
  excerpt: string;
  /** Cleaned HTML body — the prose unwrapped from WP block markup. */
  bodyHtml: string;
  /** Original raw post_content (kept for diagnostics; not imported). */
  rawPostContent: string;
  publishedDate: string; // ISO date
  modifiedDate: string;
  externalLink: string | null;
  featuredImage: string | null;
  authorName: string | null;
  /** Industry slugs derived from the article's WP category taxonomy. */
  industries: string[];
}

/**
 * Map WordPress `category` taxonomy slugs to our industry slugs.
 *
 * The category taxonomy was used inconsistently in WP — sometimes as a
 * coarse industry tag (Agricultural, Mining, Construction…), sometimes
 * as the default "Uncategorized" placeholder. We map the meaningful ones
 * and drop the rest. Locale-specific variants like `agricultural-de`
 * are stripped to their base before mapping.
 */
const CATEGORY_TO_INDUSTRY: Record<string, string> = {
  agricultural: 'agricultural-tires',
  construction: 'construction-tires',
  mining: 'mining-tires',
  forestry: 'forestry-tires',
  'material-handling': 'industrial-forklift-tires',
  'off-the-road': 'off-the-road-tires',
  'rubber-tracks': 'rubber-tracks',
  'solid-otr': 'solid-otr-tires',
  tbr: 'tbr-tires',
};

function categoryToIndustry(slug: string): string | null {
  if (!slug) return null;
  // Strip WPML language suffix variants: agricultural-en-ca, mining-zh-hant, etc.
  const base = slug
    .replace(/-(?:en-uk|en-ca|fr|fr-ca|de|it|ja|pt-pt|ru|es|es-mx|ar-ae|zh-hant|zh-hans)(?:-\d+)?$/, '')
    .replace(/-zh-hant-\d+$/, '');
  return CATEGORY_TO_INDUSTRY[base] ?? null;
}

/**
 * WordPress wraps article prose in an `acf/block-post-content` Gutenberg block:
 *
 *   <!-- wp:acf/block-post-content {"name":"acf/block-post-content","data":{"content":"...HTML...","..."} /-->
 *
 * The content field is JSON-escaped HTML. This unwraps it.
 * Falls back to the raw post_content if no block is found.
 */
function extractBodyHtml(raw: string): string {
  if (!raw) return '';

  // Find the JSON payload between `wp:acf/block-post-content ` and ` /-->` or ` -->`.
  // Use a non-greedy match so we don't gobble multiple blocks.
  const blockMatch = raw.match(
    /<!--\s*wp:acf\/block-post-content\s+(\{[\s\S]*?\})\s*\/?-->/
  );
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      const content = parsed?.data?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
    } catch {
      // Fall through to raw content if JSON parse fails.
    }
  }

  // No ACF block — strip <pre>/<style> wrapping and return what's left.
  // Most posts without the ACF block are very short or have plain HTML.
  return raw
    .replace(/<pre>[\s\S]*?<\/pre>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .trim();
}

async function fetchArticles(db: any, language: string): Promise<Article[]> {
  // Fetch both news and post types in one go, joining WPML for language scoping.
  const [posts] = await db.query(
    `SELECT
       p.ID, p.post_type, p.post_title, p.post_name AS slug, p.post_content,
       p.post_excerpt, p.post_date, p.post_modified,
       ic.trid, ic.language_code AS language,
       u.display_name AS author_name
     FROM wp_posts p
     JOIN wp_icl_translations ic
       ON ic.element_id = p.ID
       AND ic.element_type = CONCAT('post_', p.post_type)
     LEFT JOIN wp_users u ON p.post_author = u.ID
     WHERE p.post_type IN ('news', 'post')
       AND p.post_status = 'publish'
       AND ic.language_code = ?
     ORDER BY p.post_date DESC`,
    [language]
  );

  const articles: Article[] = [];

  for (const row of posts as any[]) {
    // Pull all post meta in one query per post.
    const [meta] = await db.query(
      `SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ? AND meta_key NOT LIKE '\\_%'`,
      [row.ID]
    );
    const metaMap = new Map<string, string>();
    for (const m of meta as any[]) metaMap.set(m.meta_key, m.meta_value);

    // News-type taxonomy classifies news entries as press-release vs in-the-news.
    let type: ArticleType = 'blog';
    if (row.post_type === 'news') {
      const [terms] = await db.query(
        `SELECT t.slug FROM wp_terms t
         JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
         JOIN wp_term_relationships tr ON tr.term_taxonomy_id = tt.term_taxonomy_id
         WHERE tr.object_id = ? AND tt.taxonomy = 'news-type'`,
        [row.ID]
      );
      const slug = (terms as any[])[0]?.slug;
      type = slug === 'press-release' ? 'press-release' : 'in-the-news';
    }

    // Industries via the WP `category` taxonomy. WP sometimes attaches multiple
    // categories — collect all that map to a real industry.
    const [catTerms] = await db.query(
      `SELECT t.slug FROM wp_terms t
       JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
       JOIN wp_term_relationships tr ON tr.term_taxonomy_id = tt.term_taxonomy_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'category'`,
      [row.ID]
    );
    const industriesSet = new Set<string>();
    for (const t of catTerms as any[]) {
      const ind = categoryToIndustry(t.slug);
      if (ind) industriesSet.add(ind);
    }
    const industries = [...industriesSet];

    // Resolve _thumbnail_id (featured image) — this is a hidden meta key but
    // it's the only way to find the featured image.
    const [thumb] = await db.query(
      `SELECT meta_value FROM wp_postmeta WHERE post_id = ? AND meta_key = '_thumbnail_id'`,
      [row.ID]
    );
    let featuredImage: string | null = null;
    const thumbId = (thumb as any[])[0]?.meta_value;
    if (thumbId) {
      const [att] = await db.query(`SELECT guid FROM wp_posts WHERE ID = ?`, [thumbId]);
      featuredImage = (att as any[])[0]?.guid ?? null;
    }

    const raw = row.post_content ?? '';
    articles.push({
      wpId: row.ID,
      trid: row.trid,
      language: row.language,
      type,
      title: row.post_title,
      slug: row.slug,
      excerpt: row.post_excerpt ?? '',
      bodyHtml: extractBodyHtml(raw),
      rawPostContent: raw,
      publishedDate: row.post_date instanceof Date ? row.post_date.toISOString() : row.post_date,
      modifiedDate: row.post_modified instanceof Date
        ? row.post_modified.toISOString()
        : row.post_modified,
      externalLink: metaMap.get('article_link') || null,
      featuredImage,
      authorName: row.author_name ?? null,
      industries,
    });
  }

  return articles;
}

export async function extractArticles(locales: string[]) {
  const db = await getConnection();
  for (const locale of locales) {
    const articles = await fetchArticles(db, locale);
    writeFileSync(join(OUT, `articles-${locale}.json`), JSON.stringify(articles, null, 2));
    const byType = articles.reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    console.log(
      `✓ ${locale}: ${articles.length} articles (${Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(', ')})`
    );
  }
  await db.end();
}

await extractArticles(resolveLanguages(process.argv.slice(2)));
