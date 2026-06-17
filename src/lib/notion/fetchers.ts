/**
 * Per-content-type fetchers. Each returns the snapshot shape that the
 * sync script writes to disk and the runtime data layer reads back.
 *
 * Conventions:
 *   - Snapshot rows mirror the Notion property names but flattened.
 *   - Relation properties hold Notion page IDs; the snapshot writer
 *     translates these to slugs (language-stable identity) at sync time.
 */
import { queryAllPages, fetchPageBlocks } from './query.js';
import {
  getTitle,
  getRichText,
  getSelect,
  getNumber,
  getUrl,
  getDate,
  getRelationIds,
} from './unwrap.js';
import { getNotionIds } from './client.js';

// ── Raw row types (page IDs, pre-slug-resolution) ──────────────────────

export interface RawProduct {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  subheading: string;
  sizes: string[];
  rating: number | null;
  featuredImage: string | null;
  industryIds: string[];
  applicationIds: string[];
  tireTypeIds: string[];
  documentIds: string[];
  translationIds: string[];
  blocks?: any[];
}

export interface RawTaxonomy {
  pageId: string;
  trid: number | null;
  language: string;
  name: string;
  slug: string;
  color?: string;
  bgImage?: string;
  icon?: string;
  translationIds: string[];
}

export interface RawArticle {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string;
  publishedDate: string | null;
  externalLink: string | null;
  featuredImage: string | null;
  author: string;
  industryIds: string[];
  translationIds: string[];
  blocks?: any[];
}

export interface RawDocument {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  type: string;
  fileUrl: string | null;
  thumbnail: string | null;
  translationIds: string[];
}

export interface RawTestimonial {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  authorCompany: string;
  translationIds: string[];
}

export interface RawEvent {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  featuredImage: string | null;
  translationIds: string[];
  blocks?: any[];
}

/**
 * A "Page" record holds bespoke per-route marketing content (the homepage
 * hero copy, the sustainability strip copy, etc) that doesn't fit into a
 * structured collection like Products or Articles.
 *
 * One record per (slug, language). Translation siblings are linked via
 * `trid` like every other content type. The free-form `content` field is a
 * flat key-value map so we can add new sections to a page without changing
 * the snapshot schema.
 */
export interface RawPage {
  pageId: string;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  /**
   * Flat key-value content map. Keys are dot-separated paths matching the
   * shape the page template expects, e.g.:
   *   "hero.lead", "hero.heading", "hero.description", "hero.cta_label",
   *   "hero.cta_href", "hero.background_image",
   *   "sustainability.heading", "sustainability.lead", ...
   * The template reads via `content[key]` with a default fallback.
   */
  content: Record<string, string>;
  /** Notion block body for long-form content pages (sustainability, legal…).
   *  Empty for templated pages (homepage). Split into a sidecar at sync time. */
  blocks?: any[];
  translationIds: string[];
}

/**
 * A promo card belongs to a Page (relation by pageId). Used today for the
 * homepage's "Find Your Grip" / "Rubber Tracks" pair, but reusable for any
 * page that wants a small set of card-shaped CTAs.
 */
export interface RawPagePromo {
  promoId: string;
  /** Owning Page record's pageId. */
  pageId: string;
  trid: number | null;
  language: string;
  /** Sort order within the page. */
  order: number;
  tag: string | null;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
  imagePosition: string;
  translationIds: string[];
}

// ── Sizes are stored as a comma-separated text field. Split it. ────────
function parseSizes(s: string): string[] {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// ── Fetchers ───────────────────────────────────────────────────────────

export async function fetchProducts({ withBlocks = false, blockLangs = null as string[] | null } = {}): Promise<RawProduct[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.productsDataSourceId);
  const rows: RawProduct[] = [];
  for (const p of pages) {
    const props = p.properties;
    const language = getSelect(props, 'Language') ?? 'en';
    const row: RawProduct = {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language,
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      subheading: getRichText(props, 'Subheading'),
      sizes: parseSizes(getRichText(props, 'Sizes')),
      rating: getNumber(props, 'Rating'),
      featuredImage: getUrl(props, 'Featured Image'),
      industryIds: getRelationIds(props, 'Industries'),
      applicationIds: getRelationIds(props, 'Applications'),
      tireTypeIds: getRelationIds(props, 'Tire Type'),
      documentIds: getRelationIds(props, 'Documents'),
      translationIds: getRelationIds(props, 'Translations'),
    };
    // Fetch blocks only when requested, and only for the requested languages
    // (blockLangs null = all). Lets the sync refresh one language's bodies
    // without re-fetching every language — the multi-language scaling fix.
    if (withBlocks && (!blockLangs || blockLangs.includes(language))) {
      row.blocks = await fetchPageBlocks(p.id);
    }
    rows.push(row);
  }
  return rows;
}

async function fetchTaxonomyDb(
  dataSourceId: string,
  options: { hasColor?: boolean; hasBgImage?: boolean; hasIcon?: boolean } = {}
): Promise<RawTaxonomy[]> {
  const pages = await queryAllPages(dataSourceId);
  return pages.map((p: any) => {
    const props = p.properties;
    return {
      pageId: p.id,
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      name: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      color: options.hasColor ? getRichText(props, 'Color') || undefined : undefined,
      bgImage: options.hasBgImage ? getUrl(props, 'Background Image') ?? undefined : undefined,
      icon: options.hasIcon ? getUrl(props, 'Icon') ?? undefined : undefined,
      translationIds: getRelationIds(props, 'Translations'),
    };
  });
}

export async function fetchIndustries(): Promise<RawTaxonomy[]> {
  return fetchTaxonomyDb(getNotionIds().industriesDataSourceId, {
    hasColor: true,
    hasBgImage: true,
  });
}

export async function fetchApplications(): Promise<RawTaxonomy[]> {
  return fetchTaxonomyDb(getNotionIds().applicationsDataSourceId, { hasIcon: true });
}

export async function fetchTireTypes(): Promise<RawTaxonomy[]> {
  return fetchTaxonomyDb(getNotionIds().tireTypesDataSourceId);
}

export async function fetchArticles({ withBlocks = false, blockLangs = null as string[] | null } = {}): Promise<RawArticle[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.articlesDataSourceId);
  const rows: RawArticle[] = [];
  for (const p of pages) {
    const props = p.properties;
    const language = getSelect(props, 'Language') ?? 'en';
    const row: RawArticle = {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language,
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      type: getSelect(props, 'Type') ?? 'blog',
      excerpt: getRichText(props, 'Excerpt'),
      publishedDate: getDate(props, 'Published Date'),
      externalLink: getUrl(props, 'External Link'),
      featuredImage: getUrl(props, 'Featured Image'),
      author: getRichText(props, 'Author'),
      industryIds: getRelationIds(props, 'Industries'),
      translationIds: getRelationIds(props, 'Translations'),
    };
    if (withBlocks && (!blockLangs || blockLangs.includes(language))) {
      row.blocks = await fetchPageBlocks(p.id);
    }
    rows.push(row);
  }
  return rows;
}

export async function fetchDocuments(): Promise<RawDocument[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.documentsDataSourceId);
  return pages.map((p: any) => {
    const props = p.properties;
    return {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      type: getSelect(props, 'Type') ?? 'product-sheet',
      fileUrl: getUrl(props, 'File URL'),
      thumbnail: getUrl(props, 'Thumbnail'),
      translationIds: getRelationIds(props, 'Translations'),
    };
  });
}

export async function fetchTestimonials(): Promise<RawTestimonial[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.testimonialsDataSourceId);
  return pages.map((p: any) => {
    const props = p.properties;
    return {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      quote: getRichText(props, 'Quote'),
      authorName: getRichText(props, 'Author Name'),
      authorTitle: getRichText(props, 'Author Title'),
      authorCompany: getRichText(props, 'Author Company'),
      translationIds: getRelationIds(props, 'Translations'),
    };
  });
}

export async function fetchEvents({ withBlocks = false } = {}): Promise<RawEvent[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.eventsDataSourceId);
  const rows: RawEvent[] = [];
  for (const p of pages) {
    const props = p.properties;
    const row: RawEvent = {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      startDate: getDate(props, 'Start Date'),
      endDate: getDate(props, 'End Date'),
      featuredImage: getUrl(props, 'Featured Image'),
      translationIds: getRelationIds(props, 'Translations'),
    };
    if (withBlocks) row.blocks = await fetchPageBlocks(p.id);
    rows.push(row);
  }
  return rows;
}

/**
 * Pages — bespoke per-route marketing content (homepage hero, sustainability
 * strip, newsletter copy). Sourced from the Notion "Pages" database; the sync
 * script treats a missing config or empty result as a hard error rather than
 * silently serving stale snapshot content. Returns [] only when
 * `pagesDataSourceId` isn't configured (sync then errors on that condition).
 */
export async function fetchPages(): Promise<RawPage[]> {
  const ids = getNotionIds();
  if (!ids.pagesDataSourceId) return [];
  const pages = await queryAllPages(ids.pagesDataSourceId);
  const out: RawPage[] = [];
  for (const p of pages) {
    const props = p.properties;
    // Editorial enters content as one rich-text property per key; key names
    // contain a dot (e.g. "hero.lead", "sustainability.body") so we collect
    // any property whose name follows that convention. (Templated pages like
    // the homepage use this flat map; long-form content pages use the block
    // body below instead.)
    const content: Record<string, string> = {};
    for (const key of Object.keys(props)) {
      if (!key.includes('.')) continue;
      const val = getRichText(props, key) || getUrl(props, key) || '';
      if (val) content[key] = val;
    }
    // Also capture the page's block body. Long-form pages (sustainability,
    // legal, etc.) are authored as Notion blocks and rendered via NotionBlocks;
    // templated pages simply have an empty body and get no sidecar.
    const blocks = await fetchPageBlocks(p.id);
    out.push({
      pageId: p.id,
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      content,
      blocks,
      translationIds: getRelationIds(props, 'Translations'),
    } as RawPage);
  }
  return out;
}

/**
 * Page Promos — repeating card content owned by a Page (the homepage
 * "Find Your Grip" / "Rubber Tracks" cards). Sourced from the Notion
 * "Page Promos" database. Returns [] only when `pagePromosDataSourceId`
 * isn't configured; the sync script errors on that condition.
 */
export async function fetchPagePromos(): Promise<RawPagePromo[]> {
  const ids = getNotionIds();
  if (!ids.pagePromosDataSourceId) return [];
  const pages = await queryAllPages(ids.pagePromosDataSourceId);
  return pages.map((p: any) => {
    const props = p.properties;
    const pageRel = getRelationIds(props, 'Page');
    return {
      promoId: p.id,
      pageId: pageRel[0] ?? '',
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      order: getNumber(props, 'Order') ?? 0,
      tag: getRichText(props, 'Tag') || null,
      heading: getRichText(props, 'Heading') || '',
      description: getRichText(props, 'Description') || '',
      ctaLabel: getRichText(props, 'CTA Label') || '',
      ctaHref: getRichText(props, 'CTA Href') || '',
      image: getUrl(props, 'Image'),
      imagePosition: getRichText(props, 'Image Position') || 'center',
      translationIds: getRelationIds(props, 'Translations'),
    } as RawPagePromo;
  });
}
