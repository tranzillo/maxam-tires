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

// ── Sizes are stored as a comma-separated text field. Split it. ────────
function parseSizes(s: string): string[] {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

// ── Fetchers ───────────────────────────────────────────────────────────

export async function fetchProducts({ withBlocks = false } = {}): Promise<RawProduct[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.productsDataSourceId);
  const rows: RawProduct[] = [];
  for (const p of pages) {
    const props = p.properties;
    const row: RawProduct = {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
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
    if (withBlocks) row.blocks = await fetchPageBlocks(p.id);
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

export async function fetchArticles({ withBlocks = false } = {}): Promise<RawArticle[]> {
  const ids = getNotionIds();
  const pages = await queryAllPages(ids.articlesDataSourceId);
  const rows: RawArticle[] = [];
  for (const p of pages) {
    const props = p.properties;
    const row: RawArticle = {
      pageId: p.id,
      wpId: getNumber(props, 'WP ID'),
      trid: getNumber(props, 'Translation Group'),
      language: getSelect(props, 'Language') ?? 'en',
      title: getTitle(props, 'Name'),
      slug: getRichText(props, 'Slug'),
      type: getSelect(props, 'Type') ?? 'blog',
      excerpt: getRichText(props, 'Excerpt'),
      publishedDate: getDate(props, 'Published Date'),
      externalLink: getUrl(props, 'External Link'),
      featuredImage: getUrl(props, 'Featured Image'),
      author: getRichText(props, 'Author'),
      translationIds: getRelationIds(props, 'Translations'),
    };
    if (withBlocks) row.blocks = await fetchPageBlocks(p.id);
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
