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
  Locale,
} from '../types';

import productsJson from '../data/notion-content/products.json';
import articlesJson from '../data/notion-content/articles.json';
import industriesJson from '../data/notion-content/industries.json';
import applicationsJson from '../data/notion-content/applications.json';
import tireTypesJson from '../data/notion-content/tire-types.json';
import documentsJson from '../data/notion-content/documents.json';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve the blocks directory once. Sidecar block files are read lazily
// at build time to avoid statically importing tens of MB of JSON into
// every page bundle.
const blocksDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'notion-content',
  'blocks'
);

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
}

const products = productsJson as ProductRow[];
const articles = articlesJson as ArticleRow[];
const industries = industriesJson as TaxonomyRow[];
const applications = applicationsJson as TaxonomyRow[];
const tireTypes = tireTypesJson as TaxonomyRow[];
const documents = documentsJson as DocumentRow[];

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
    galleryImages: [],
    documents: p.documents
      .map((s) => documentBySlug.get(indKey(s)))
      .filter((r): r is DocumentRow => Boolean(r))
      .map(toDocument),
  };
}

function toArticle(a: ArticleRow): Article {
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
    industries: [],
    externalUrl: a.externalLink ?? undefined,
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

export function getAllArticles(locale: Locale): Article[] {
  return articles.filter((a) => a.language === locale).map(toArticle);
}

export function getArticleBySlug(locale: Locale, slug: string): Article | undefined {
  const row = articles.find((a) => a.language === locale && a.slug === slug);
  return row ? toArticle(row) : undefined;
}

/** Get the Notion block tree for an article (full prose body). */
export function getArticleBlocks(locale: Locale, slug: string): any[] {
  return readBlocks('article', locale, slug);
}

export function getArticlesByType(locale: Locale, type: ArticleType): Article[] {
  return articles
    .filter((a) => a.language === locale)
    .map(toArticle)
    .filter((a) => a.type === type);
}

export function getArticlesByIndustry(_locale: Locale, _industrySlug: string): Article[] {
  // Articles aren't tagged with industries in the current Notion schema;
  // when that relation is added, switch this to filter on it.
  return [];
}

export function getRecentArticles(locale: Locale, limit: number): Article[] {
  return [...articles]
    .filter((a) => a.language === locale)
    .sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
    .slice(0, limit)
    .map(toArticle);
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
