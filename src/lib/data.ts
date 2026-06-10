/**
 * Unified data access layer.
 *
 * Backed by JSON snapshots in src/data/notion-content/*.json that are
 * produced by `npm run sync` (scripts/sync-from-notion.ts). The build is
 * fully offline — Astro never makes Notion API calls.
 *
 * All query functions accept locale and return shapes matching src/types/.
 */
import type {
  Tire,
  Industry,
  Application,
  TireType,
  Article,
  ArticleType,
  Document as Doc,
  Testimonial,
  Event,
  Locale,
} from '../types';

import productsJson from '../data/notion-content/products.json';
import articlesJson from '../data/notion-content/articles.json';
import industriesJson from '../data/notion-content/industries.json';
import applicationsJson from '../data/notion-content/applications.json';
import tireTypesJson from '../data/notion-content/tire-types.json';
import documentsJson from '../data/notion-content/documents.json';
import testimonialsJson from '../data/notion-content/testimonials.json';
import eventsJson from '../data/notion-content/events.json';
import pagesJson from '../data/notion-content/pages.json';
import pagePromosJson from '../data/notion-content/page-promos.json';
import productSpecsEn from '../data/notion-content/product-specs.en.json';
import productSpecsArAe from '../data/notion-content/product-specs.ar-ae.json';
import productSpecsZhHant from '../data/notion-content/product-specs.zh-hant.json';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Sidecar block files are read lazily at build time to avoid statically
// importing tens of MB of JSON into every page bundle.
//
// We resolve from `process.cwd()` rather than `import.meta.url` because
// Astro bundles this module into dist/.prerender/chunks/* during `astro
// build`, which makes `import.meta.url`-relative paths point at the
// wrong location. `process.cwd()` is the project root in both `astro
// dev` and `astro build`, so the path is stable.
const blocksDir = join(process.cwd(), 'src', 'data', 'notion-content', 'blocks');

function readBlocks(type: 'product' | 'article' | 'event', locale: string, slug: string): any[] {
  const file = join(blocksDir, `${type}-${locale}-${slug}.json`);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

// ── Snapshot row types (mirror scripts/sync-from-notion output) ────────

interface ProductRow {
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
  industries: string[]; // slug list
  applications: string[]; // slug list
  tireType: string | null; // slug
  documents: string[]; // slug list
  /** Notion block tree (only present when sync ran with bodies). */
  blocks?: any[];
}

interface TaxonomyRow {
  pageId: string;
  trid: number | null;
  language: string;
  name: string;
  slug: string;
  color?: string;
  bgImage?: string;
  icon?: string;
}

interface ArticleRow {
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
  /** Industry slugs derived from WP `category` taxonomy (resolved at sync). */
  industries?: string[];
  /** Notion block tree (only present when sync ran with bodies). */
  blocks?: any[];
}

interface DocumentRow {
  pageId: string;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  type: string;
  fileUrl: string | null;
  thumbnail: string | null;
  /** Industries derived from products that link to this document (synced). */
  industries?: string[];
}

interface TestimonialRow {
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
}

interface EventRow {
  pageId: string;
  wpId: number | null;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  startDate: string | null;
  endDate: string | null;
  featuredImage: string | null;
}

interface PageRow {
  pageId: string;
  trid: number | null;
  language: string;
  title: string;
  slug: string;
  content: Record<string, string>;
  translationIds: string[];
}

interface PagePromoRow {
  promoId: string;
  pageId: string;
  trid: number | null;
  language: string;
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

const products = productsJson as ProductRow[];
const articles = articlesJson as ArticleRow[];
const industries = industriesJson as TaxonomyRow[];
const applications = applicationsJson as TaxonomyRow[];
const tireTypes = tireTypesJson as TaxonomyRow[];
const documents = documentsJson as DocumentRow[];
const testimonials = testimonialsJson as TestimonialRow[];
const events = eventsJson as EventRow[];
const pages = pagesJson as PageRow[];
const pagePromos = pagePromosJson as PagePromoRow[];

// ── Per-locale slug → row indexes (built once, reused everywhere) ──────

function indexBySlug<T extends { language: string; slug: string }>(rows: T[]) {
  const m = new Map<string, T>();
  for (const r of rows) m.set(`${r.language}::${r.slug}`, r);
  return m;
}

const industryBySlug = indexBySlug(industries);
const applicationBySlug = indexBySlug(applications);
const tireTypeBySlug = indexBySlug(tireTypes);
const documentBySlug = indexBySlug(documents);

// ── Mappers from snapshot rows → domain types ──────────────────────────

function toIndustry(row: TaxonomyRow): Industry {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    color: row.color || '#FFB81C',
    heroImage: row.bgImage,
  };
}

function toApplication(row: TaxonomyRow): Application {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    industryIds: [], // filled from product relationships if needed
  };
}

function toTireType(row: TaxonomyRow): TireType {
  return { id: row.slug, slug: row.slug, name: row.name };
}

function toDocument(row: DocumentRow): Doc {
  // Domain type only allows 'brochure'|'product-sheet'|'compliance' — Notion
  // produces those plus eventually others; coerce safely.
  const type = (['brochure', 'product-sheet', 'compliance'].includes(row.type)
    ? row.type
    : 'product-sheet') as Doc['type'];
  return {
    id: row.slug,
    title: row.title,
    type,
    fileUrl: row.fileUrl ?? '',
  };
}

function toTire(p: ProductRow, locale: Locale): Tire {
  const indKey = (slug: string) => `${locale}::${slug}`;
  return {
    id: p.slug,
    slug: p.slug,
    title: p.title,
    subheading: p.subheading || undefined,
    description: '', // body lives in Notion blocks; rendered separately
    industries: p.industries
      .map((s) => industryBySlug.get(indKey(s)))
      .filter((r): r is TaxonomyRow => Boolean(r))
      .map(toIndustry),
    applications: p.applications
      .map((s) => applicationBySlug.get(indKey(s)))
      .filter((r): r is TaxonomyRow => Boolean(r))
      .map(toApplication),
    tireType: p.tireType
      ? (() => {
          const t = tireTypeBySlug.get(indKey(p.tireType!));
          return t ? toTireType(t) : undefined;
        })()
      : undefined,
    sizes: p.sizes,
    rating: p.rating ?? undefined,
    features: [],
    specifications: [],
    featuredImage: p.featuredImage ?? undefined,
    galleryImages: [],
    documents: p.documents
      .map((s) => documentBySlug.get(indKey(s)))
      .filter((r): r is DocumentRow => Boolean(r))
      .map(toDocument),
  };
}

/**
 * Resolve industry slug list to full Industry domain objects, scoped to the
 * locale. Used by both Article and Document → Article adapters.
 */
function resolveIndustries(slugs: string[], locale: Locale): Industry[] {
  return slugs
    .map((s) => industryBySlug.get(`${locale}::${s}`))
    .filter((r): r is TaxonomyRow => Boolean(r))
    .map(toIndustry);
}

function toArticle(a: ArticleRow, locale: Locale): Article {
  // Map Notion type → domain ArticleType. The domain type currently has
  // 'blog' | 'news' | 'event' | 'product-sheet' | 'brochure'. Notion
  // distinguishes press-release vs in-the-news; both collapse to 'news'
  // for the existing UI surface, but we preserve the original in `type`.
  const articleType: ArticleType =
    a.type === 'blog' ? 'blog' : a.type === 'press-release' || a.type === 'in-the-news' ? 'news' : 'news';
  return {
    id: a.slug,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    content: '', // rendered from Notion blocks at the page layer
    type: articleType,
    date: a.publishedDate ?? '',
    featuredImage: a.featuredImage ?? undefined,
    industries: resolveIndustries(a.industries ?? [], locale),
    externalUrl: a.externalLink ?? undefined,
  };
}

/**
 * Adapt a DocumentRow to the Article shape so the Resources page can merge
 * documents into the same feed and use existing card/filter machinery.
 *
 * The card uses `fileUrl` to render a download button, and `industries`
 * for the industry filter. Documents have no published date in Notion;
 * we leave `date` empty so they sort to the bottom of date-sorted lists.
 */
function documentToArticle(d: DocumentRow, locale: Locale): Article {
  const articleType: ArticleType = (d.type === 'brochure' || d.type === 'product-sheet'
    ? d.type
    : 'product-sheet') as ArticleType;
  return {
    id: d.slug,
    slug: d.slug,
    title: d.title,
    excerpt: '',
    content: '',
    type: articleType,
    date: '', // documents have no publish date in our schema
    featuredImage: d.thumbnail ?? undefined,
    industries: resolveIndustries(d.industries ?? [], locale),
    fileUrl: d.fileUrl ?? undefined,
  };
}

// ── Product queries ─────────────────────────────────────────────────────

export function getAllProducts(locale: Locale): Tire[] {
  // Drop products without an industry — they have no canonical /products/<industry>/<slug>
  // URL. There are 5 such records in WP (untagged), so we skip them globally.
  return products
    .filter((p) => p.language === locale && p.industries.length > 0)
    .map((p) => toTire(p, locale));
}

export function getProductBySlug(locale: Locale, slug: string): Tire | undefined {
  const row = products.find((p) => p.language === locale && p.slug === slug);
  return row ? toTire(row, locale) : undefined;
}

/** Get the Notion block tree for a product (description, features, spec table, gallery). */
export function getProductBlocks(locale: Locale, slug: string): any[] {
  return readBlocks('product', locale, slug);
}

export function getProductsByIndustry(locale: Locale, industrySlug: string): Tire[] {
  return products
    .filter((p) => p.language === locale && p.industries.includes(industrySlug))
    .map((p) => toTire(p, locale));
}

export function getFeaturedProducts(locale: Locale, limit?: number): Tire[] {
  const all = products.filter((p) => p.language === locale && p.industries.length > 0);
  const sliced = limit ? all.slice(0, limit) : all;
  return sliced.map((p) => toTire(p, locale));
}

// ── Industry queries ────────────────────────────────────────────────────

export function getAllIndustries(locale: Locale): Industry[] {
  return industries.filter((i) => i.language === locale).map(toIndustry);
}

export function getIndustryBySlug(locale: Locale, slug: string): Industry | undefined {
  const row = industries.find((i) => i.language === locale && i.slug === slug);
  return row ? toIndustry(row) : undefined;
}

// ── Application queries ─────────────────────────────────────────────────

export function getAllApplications(locale: Locale): Application[] {
  return applications.filter((a) => a.language === locale).map(toApplication);
}

// ── Article queries ─────────────────────────────────────────────────────

/**
 * Returns articles only — blog/news/event content with prose bodies.
 * For the Resources page that mixes articles AND documents, use
 * `getAllResources(locale)` instead.
 */
export function getAllArticles(locale: Locale): Article[] {
  return articles.filter((a) => a.language === locale).map((a) => toArticle(a, locale));
}

export function getArticleBySlug(locale: Locale, slug: string): Article | undefined {
  const row = articles.find((a) => a.language === locale && a.slug === slug);
  return row ? toArticle(row, locale) : undefined;
}

/** Get the Notion block tree for an article (full prose body). */
export function getArticleBlocks(locale: Locale, slug: string): any[] {
  return readBlocks('article', locale, slug);
}

export function getArticlesByType(locale: Locale, type: ArticleType): Article[] {
  return articles
    .filter((a) => a.language === locale)
    .map((a) => toArticle(a, locale))
    .filter((a) => a.type === type);
}

export function getArticlesByIndustry(locale: Locale, industrySlug: string): Article[] {
  return articles
    .filter((a) => a.language === locale && (a.industries ?? []).includes(industrySlug))
    .map((a) => toArticle(a, locale));
}

export function getRecentArticles(locale: Locale, limit: number): Article[] {
  return [...articles]
    .filter((a) => a.language === locale)
    .sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
    .slice(0, limit)
    .map((a) => toArticle(a, locale));
}

// ── Document queries ────────────────────────────────────────────────────

/** Documents (brochures + product sheets) as Article-shaped objects. */
export function getAllDocuments(locale: Locale): Article[] {
  return documents
    .filter((d) => d.language === locale)
    .map((d) => documentToArticle(d, locale));
}

/** Documents as Document domain objects (with native fileUrl/type),
 *  for callers that want to render a RubberDocumentCard. */
export function getAllRawDocuments(locale: Locale): Doc[] {
  return documents
    .filter((d) => d.language === locale)
    .map(toDocument);
}

// ── Testimonial queries ─────────────────────────────────────────────────

function toTestimonial(t: TestimonialRow): Testimonial {
  return {
    id: t.slug,
    slug: t.slug,
    title: t.title,
    quote: t.quote,
    authorName: t.authorName || undefined,
    authorTitle: t.authorTitle || undefined,
    authorCompany: t.authorCompany || undefined,
  };
}

export function getAllTestimonials(locale: Locale): Testimonial[] {
  return testimonials.filter((t) => t.language === locale).map(toTestimonial);
}

// ── Event queries ───────────────────────────────────────────────────────

function toEvent(e: EventRow, locale: Locale): Event {
  return {
    id: e.slug,
    slug: e.slug,
    title: e.title,
    startDate: e.startDate ?? undefined,
    endDate: e.endDate ?? undefined,
    featuredImage: e.featuredImage ?? undefined,
    href: `/${locale}/resources/${e.slug}`,
  };
}

export function getAllEvents(locale: Locale): Event[] {
  return events.filter((e) => e.language === locale).map((e) => toEvent(e, locale));
}

// ── Unified resource feed ──────────────────────────────────────────────

/**
 * Everything that should appear on the Resource Center page: articles
 * (blog + news + events) AND documents (brochures + product sheets).
 * All adapted to the Article shape so the existing card and filter UI
 * work without branching.
 *
 * Sorted by date desc; documents have no date, so they fall to the end.
 */
export function getAllResources(locale: Locale): Article[] {
  const articleEntries = articles
    .filter((a) => a.language === locale)
    .map((a) => toArticle(a, locale));
  const documentEntries = documents
    .filter((d) => d.language === locale)
    .map((d) => documentToArticle(d, locale));
  return [...articleEntries, ...documentEntries].sort((a, b) => b.date.localeCompare(a.date));
}

// ── Utilities ───────────────────────────────────────────────────────────

export function getAllSizes(): string[] {
  const set = new Set<string>();
  for (const p of products) for (const s of p.sizes) set.add(s);
  return [...set].sort();
}

export function getAllRatings(): number[] {
  const set = new Set<number>();
  for (const p of products) if (p.rating !== null) set.add(p.rating);
  return [...set].sort((a, b) => a - b);
}

// ── Pages (bespoke per-route content) ──────────────────────────────────

export interface PageContent {
  /** ISO slug of the page (e.g. "home"). */
  slug: string;
  /** Locale this content was loaded for. */
  language: string;
  /** Flat key-value content map; see RawPage docs in fetchers.ts. */
  content: Record<string, string>;
}

export interface PagePromo {
  order: number;
  tag: string | null;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
  imagePosition: string;
}

/**
 * Look up a single content key with an optional fallback. Returns the empty
 * string if the key is missing — callers can decide whether to render or
 * suppress that piece of UI.
 */
export function pageText(page: PageContent | undefined, key: string, fallback = ''): string {
  if (!page) return fallback;
  return page.content[key] ?? fallback;
}

/**
 * Get the bespoke content record for a page, in the requested locale.
 * Returns undefined if no record exists for that (locale, slug).
 */
export function getPageContent(locale: Locale, slug: string): PageContent | undefined {
  const row = pages.find((p) => p.language === locale && p.slug === slug);
  if (!row) return undefined;
  return {
    slug: row.slug,
    language: row.language,
    content: row.content,
  };
}

/**
 * Get the promo cards owned by a page, in the requested locale, sorted by order.
 * Page is identified by its slug (which is locale-stable) so callers don't
 * need to know about pageIds.
 */
export function getPagePromos(locale: Locale, pageSlug: string): PagePromo[] {
  // Resolve the page record to its pageId so we can match promos by relation.
  const page = pages.find((p) => p.language === locale && p.slug === pageSlug);
  if (!page) return [];
  return pagePromos
    .filter((promo) => promo.language === locale && promo.pageId === page.pageId)
    .sort((a, b) => a.order - b.order)
    .map((promo) => ({
      order: promo.order,
      tag: promo.tag,
      heading: promo.heading,
      description: promo.description,
      ctaLabel: promo.ctaLabel,
      ctaHref: promo.ctaHref,
      image: promo.image,
      imagePosition: promo.imagePosition,
    }));
}

// ── Product specs (per-product structured spec table) ──────────────────

export interface SpecField {
  label: string;
  value: string;
  unit: string | null;
}

export interface SpecVariant {
  size: string;
  fields: SpecField[];
}

export interface ProductSpecs {
  headers: string[];
  units: (string | null)[];
  variants: SpecVariant[];
}

const productSpecsByLocale: Record<Locale, Record<string, ProductSpecs>> = {
  en: productSpecsEn as Record<string, ProductSpecs>,
  'ar-ae': productSpecsArAe as Record<string, ProductSpecs>,
  'zh-hant': productSpecsZhHant as Record<string, ProductSpecs>,
};

/**
 * Structured spec table for a product, in the requested locale.
 * Each variant is one selectable spec row (a size, possibly with a
 * tread-compound qualifier); measurement fields carry both units.
 * Returns undefined if the product has no spec table.
 */
export function getProductSpecs(locale: Locale, slug: string): ProductSpecs | undefined {
  return productSpecsByLocale[locale]?.[slug];
}
