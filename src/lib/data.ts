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
  ContentLanguage,
} from '../types';
import { contentLang } from './i18n';

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
import productSpecsDe from '../data/notion-content/product-specs.de.json';
import productSpecsEs from '../data/notion-content/product-specs.es.json';
import productSpecsFr from '../data/notion-content/product-specs.fr.json';
import productSpecsIt from '../data/notion-content/product-specs.it.json';
import productSpecsJa from '../data/notion-content/product-specs.ja.json';
import productSpecsPtPt from '../data/notion-content/product-specs.pt-pt.json';
import productSpecsRu from '../data/notion-content/product-specs.ru.json';
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

// ── Canonical (locale-stable) URL slugs ────────────────────────────────
// WPML gives each locale its own slug (tbr-de, tbr-tires-zh-hant, …). URLs
// must NOT vary by locale, so we canonicalize every industry/product URL to
// its ENGLISH slug, keyed by trid. Content stays per-locale; only the URL
// segment is stabilized. These maps power both URL generation (canonicalSlug
// on the domain object) and URL→row resolution (canonicalProduct/IndustrySlug
// back to the locale row).

function buildCanonicalMaps<T extends { trid: number | null; language: string; slug: string }>(rows: T[]) {
  // trid → english slug (the canonical URL segment)
  const tridToEn = new Map<number, string>();
  for (const r of rows) {
    if (r.language === 'en' && r.trid != null) tridToEn.set(r.trid, r.slug);
  }
  // `${locale}::${localeSlug}` → english slug  (for outbound URL building)
  const localeSlugToEn = new Map<string, string>();
  // `${locale}::${englishSlug}` → locale row    (for inbound URL resolution)
  const enSlugToRow = new Map<string, T>();
  for (const r of rows) {
    if (r.trid == null) continue;
    const en = tridToEn.get(r.trid);
    if (!en) continue;
    localeSlugToEn.set(`${r.language}::${r.slug}`, en);
    enSlugToRow.set(`${r.language}::${en}`, r);
  }
  return { tridToEn, localeSlugToEn, enSlugToRow };
}

const industryCanon = buildCanonicalMaps(industries);
const productCanon = buildCanonicalMaps(products);

/** The canonical (English) URL slug for an industry row's locale slug. */
function canonicalIndustrySlug(locale: string, localeSlug: string): string {
  return industryCanon.localeSlugToEn.get(`${locale}::${localeSlug}`) ?? localeSlug;
}
/** The canonical (English) URL slug for a product row's locale slug. */
function canonicalProductSlug(locale: string, localeSlug: string): string {
  return productCanon.localeSlugToEn.get(`${locale}::${localeSlug}`) ?? localeSlug;
}

// ── Mappers from snapshot rows → domain types ──────────────────────────

function toIndustry(row: TaxonomyRow): Industry {
  return {
    id: row.slug,
    slug: row.slug,
    urlSlug: canonicalIndustrySlug(row.language, row.slug),
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
    urlSlug: canonicalProductSlug(p.language, p.slug),
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
 * Resolve an industry slug list to Industry domain objects for display in
 * `locale`. Used by Article/Document adapters, where the stored industry
 * slugs are ENGLISH (resources are English-only). We map each English slug →
 * its trid → the display locale's industry row, so the chip shows the
 * localized name while `urlSlug` stays canonical. Falls back to the English
 * row if the locale has no translation.
 */
function resolveIndustries(slugs: string[], locale: Locale): Industry[] {
  const lang = contentLang(locale);
  return slugs
    .map((enSlug) => {
      const enRow = industryBySlug.get(`en::${enSlug}`);
      if (!enRow || enRow.trid == null) return industryBySlug.get(`en::${enSlug}`);
      // Find the same-trid row in the display language.
      const localized = industries.find((i) => i.language === lang && i.trid === enRow.trid);
      return localized ?? enRow;
    })
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
  const lang = contentLang(locale);
  return products
    .filter((p) => p.language === lang && p.industries.length > 0)
    .map((p) => toTire(p, lang));
}

/**
 * Resolve a CANONICAL (English) product URL slug to the row for this locale.
 * Falls back to a direct per-locale slug match (covers en, and any product
 * whose slug isn't locale-suffixed).
 */
function productRowByUrlSlug(lang: string, urlSlug: string): ProductRow | undefined {
  return (
    productCanon.enSlugToRow.get(`${lang}::${urlSlug}`) ??
    products.find((p) => p.language === lang && p.slug === urlSlug)
  );
}

export function getProductBySlug(locale: Locale, slug: string): Tire | undefined {
  const lang = contentLang(locale);
  const row = productRowByUrlSlug(lang, slug);
  return row ? toTire(row, lang) : undefined;
}

/** Get the Notion block tree for a product. `slug` is the canonical URL slug;
 *  resolve it to the locale's real slug (block sidecars are keyed by that). */
export function getProductBlocks(locale: Locale, slug: string): any[] {
  const lang = contentLang(locale);
  const row = productRowByUrlSlug(lang, slug);
  return readBlocks('product', lang, row?.slug ?? slug);
}

export function getProductsByIndustry(locale: Locale, industryUrlSlug: string): Tire[] {
  const lang = contentLang(locale);
  // industryUrlSlug is canonical (English). Match each product's industries —
  // which are per-locale slugs — by canonicalizing them to English.
  return products
    .filter(
      (p) =>
        p.language === lang &&
        p.industries.some((s) => canonicalIndustrySlug(lang, s) === industryUrlSlug)
    )
    .map((p) => toTire(p, lang));
}

export function getFeaturedProducts(locale: Locale, limit?: number): Tire[] {
  const lang = contentLang(locale);
  const all = products.filter((p) => p.language === lang && p.industries.length > 0);
  const sliced = limit ? all.slice(0, limit) : all;
  return sliced.map((p) => toTire(p, lang));
}

/**
 * Most-recent products, at most one per (primary) industry, newest first,
 * capped at `max`. Powers the homepage "recent products" grid: with 10
 * industries the grid is an even 5x2 at its widest; CSS hides trailing
 * items at narrower even-grid steps.
 *
 * Recency proxy: WP post id — the snapshot carries no creation date, and
 * WP ids increase with creation time. Swap to a real date (or an editorial
 * Featured flag) once one exists in the Notion Products database.
 */
export function getRecentProductsByIndustry(locale: Locale, max = 10): Tire[] {
  const lang = contentLang(locale);
  const seen = new Set<string>();
  const out: Tire[] = [];
  const sorted = products
    .filter((p) => p.language === lang && p.industries.length > 0)
    .sort((a, b) => (b.wpId ?? 0) - (a.wpId ?? 0));
  for (const row of sorted) {
    const primary = row.industries[0];
    if (seen.has(primary)) continue;
    seen.add(primary);
    out.push(toTire(row, lang));
    if (out.length >= max) break;
  }
  return out;
}

// ── Industry queries ────────────────────────────────────────────────────

export function getAllIndustries(locale: Locale): Industry[] {
  const lang = contentLang(locale);
  return industries.filter((i) => i.language === lang).map(toIndustry);
}

export function getIndustryBySlug(locale: Locale, slug: string): Industry | undefined {
  const lang = contentLang(locale);
  // `slug` is the canonical (English) URL slug; resolve to the locale row.
  const row =
    industryCanon.enSlugToRow.get(`${lang}::${slug}`) ??
    industries.find((i) => i.language === lang && i.slug === slug);
  return row ? toIndustry(row) : undefined;
}

// ── Application queries ─────────────────────────────────────────────────

export function getAllApplications(locale: Locale): Application[] {
  const lang = contentLang(locale);
  return applications.filter((a) => a.language === lang).map(toApplication);
}

// ── Article queries ─────────────────────────────────────────────────────
//
// RESOURCES ARE ENGLISH-ONLY (decision 2026-06-13). WP never translated the
// articles/documents — the per-locale rows are English passthrough, so they
// carry no value. Every locale's Resource Center renders the SAME English
// content. All resource accessors read `RESOURCE_LANG` regardless of locale;
// `locale` is kept in the signature only for building locale-prefixed hrefs.

const RESOURCE_LANG = 'en';

/**
 * Returns articles only — blog/news content with prose bodies. English-only.
 * For the Resources page that mixes articles AND documents, use
 * `getAllResources(locale)` instead.
 */
export function getAllArticles(locale: Locale): Article[] {
  return articles.filter((a) => a.language === RESOURCE_LANG).map((a) => toArticle(a, locale));
}

export function getArticleBySlug(locale: Locale, slug: string): Article | undefined {
  const row = articles.find((a) => a.language === RESOURCE_LANG && a.slug === slug);
  return row ? toArticle(row, locale) : undefined;
}

/** Get the Notion block tree for an article (full prose body). English-only. */
export function getArticleBlocks(locale: Locale, slug: string): any[] {
  return readBlocks('article', RESOURCE_LANG, slug);
}

export function getArticlesByType(locale: Locale, type: ArticleType): Article[] {
  return articles
    .filter((a) => a.language === RESOURCE_LANG)
    .map((a) => toArticle(a, locale))
    .filter((a) => a.type === type);
}

export function getArticlesByIndustry(locale: Locale, industryUrlSlug: string): Article[] {
  // industryUrlSlug is canonical (English); article industries are English too.
  return articles
    .filter((a) => a.language === RESOURCE_LANG && (a.industries ?? []).includes(industryUrlSlug))
    .map((a) => toArticle(a, locale));
}

export function getRecentArticles(locale: Locale, limit: number): Article[] {
  return [...articles]
    .filter((a) => a.language === RESOURCE_LANG)
    .sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
    .slice(0, limit)
    .map((a) => toArticle(a, locale));
}

// ── Document queries (English-only, like articles) ──────────────────────

/** Documents (brochures + product sheets) as Article-shaped objects. */
export function getAllDocuments(locale: Locale): Article[] {
  return documents
    .filter((d) => d.language === RESOURCE_LANG)
    .map((d) => documentToArticle(d, locale));
}

/** Documents as Document domain objects (with native fileUrl/type),
 *  for callers that want to render a RubberDocumentCard. */
export function getAllRawDocuments(locale: Locale): Doc[] {
  return documents
    .filter((d) => d.language === RESOURCE_LANG)
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
  const lang = contentLang(locale);
  return testimonials.filter((t) => t.language === lang).map(toTestimonial);
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
  // Filter by content language, but keep the front-end locale for the href
  // so the URL keeps its region prefix (e.g. /fr-ca/resources/...).
  const lang = contentLang(locale);
  return events.filter((e) => e.language === lang).map((e) => toEvent(e, locale));
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
  // English-only resources; `locale` only sets href prefixes.
  const articleEntries = articles
    .filter((a) => a.language === RESOURCE_LANG)
    .map((a) => toArticle(a, locale));
  const documentEntries = documents
    .filter((d) => d.language === RESOURCE_LANG)
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
  const lang = contentLang(locale);
  const row = pages.find((p) => p.language === lang && p.slug === slug);
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
  const lang = contentLang(locale);
  const page = pages.find((p) => p.language === lang && p.slug === pageSlug);
  if (!page) return [];
  return pagePromos
    .filter((promo) => promo.language === lang && promo.pageId === page.pageId)
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

/**
 * Spec tables, keyed by CONTENT language. Languages whose spec snapshot
 * hasn't been generated yet (the 7 added 2026-06-13) fall back to English
 * specs so tire pages still render a table; Phase B/C replace these with
 * per-language extracts (translated column headers).
 */
const productSpecsByLang: Record<ContentLanguage, Record<string, ProductSpecs>> = {
  en: productSpecsEn as Record<string, ProductSpecs>,
  'ar-ae': productSpecsArAe as Record<string, ProductSpecs>,
  'zh-hant': productSpecsZhHant as Record<string, ProductSpecs>,
  de: productSpecsDe as Record<string, ProductSpecs>,
  es: productSpecsEs as Record<string, ProductSpecs>,
  fr: productSpecsFr as Record<string, ProductSpecs>,
  it: productSpecsIt as Record<string, ProductSpecs>,
  ja: productSpecsJa as Record<string, ProductSpecs>,
  'pt-pt': productSpecsPtPt as Record<string, ProductSpecs>,
  ru: productSpecsRu as Record<string, ProductSpecs>,
};

/**
 * Structured spec table for a product, in the requested locale.
 * Each variant is one selectable spec row (a size, possibly with a
 * tread-compound qualifier); measurement fields carry both units.
 * Returns undefined if the product has no spec table.
 */
export function getProductSpecs(locale: Locale, slug: string): ProductSpecs | undefined {
  const lang = contentLang(locale);
  // Spec tables now come from Notion (sync-product-specs.ts) keyed by the
  // CANONICAL (English) slug — `slug` here already IS that canonical urlSlug.
  // Fall back to the per-locale row slug for safety (covers any legacy key).
  const specs = productSpecsByLang[lang];
  if (!specs) return undefined;
  return specs[slug] ?? specs[productRowByUrlSlug(lang, slug)?.slug ?? slug];
}
