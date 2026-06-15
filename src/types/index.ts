/** Industry classification for tires */
export interface Industry {
  id: string;
  slug: string;
  /**
   * Canonical, locale-stable URL slug (the English slug for this industry's
   * translation group). ALWAYS use this for hrefs/routes so URLs don't vary
   * by locale; `slug` is the per-locale WPML slug, kept for content identity.
   */
  urlSlug: string;
  name: string;
  color: string;
  heroImage?: string;
  description?: string;
}

/** Application within an industry */
export interface Application {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  industryIds: string[];
}

/** Tire type classification */
export interface TireType {
  id: string;
  slug: string;
  name: string;
}

/** Single row in a specification table (simple key-value) */
export interface SpecRow {
  name: string;
  value: string;
}

/** Multi-column spec table (from TablePress) */
export interface SpecTable {
  headers: string[];
  rows: string[][];
}

/** A downloadable document (brochure, spec sheet, etc.) */
export interface Document {
  id: string;
  title: string;
  type: 'brochure' | 'product-sheet' | 'compliance';
  fileUrl: string;
  tireIds?: string[];
}

/** Core tire product */
export interface Tire {
  id: string;
  slug: string;
  /** Canonical, locale-stable URL slug (English slug for this trid). Use for
   *  hrefs/routes; `slug` is the per-locale WPML slug for content identity. */
  urlSlug: string;
  title: string;
  subheading?: string;
  description: string;
  industries: Industry[];
  applications: Application[];
  tireType?: TireType;
  sizes: string[];
  rating?: number;
  features: string[];
  specifications: SpecRow[];
  specTable?: SpecTable;
  featuredImage?: string;
  galleryImages: string[];
  specialLogo?: string;
  documents: Document[];
}

/** Resource/article content type */
export type ArticleType = 'blog' | 'news' | 'event' | 'product-sheet' | 'brochure';

/** A resource center article (blog post, news item, event, document) */
export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  type: ArticleType;
  date: string;
  featuredImage?: string;
  industries: Industry[];
  externalUrl?: string;
  fileUrl?: string;
}

/** Customer testimonial — single quote with byline. */
export interface Testimonial {
  id: string;
  slug: string;
  /** Internal title (Notion page name); not usually shown to readers. */
  title: string;
  quote: string;
  authorName?: string;
  authorTitle?: string;
  authorCompany?: string;
}

/** Industry event (trade show, expo, etc) with a date window. */
export interface Event {
  id: string;
  slug: string;
  title: string;
  /** ISO date string (YYYY-MM-DD). */
  startDate?: string;
  endDate?: string;
  featuredImage?: string;
  location?: string;
  href?: string;
}

/**
 * Content languages — the set of languages we actually STORE (one set of
 * Notion rows / one translation file each). Regional variants are NOT here;
 * they alias to one of these (see Locale + LOCALE_ALIASES in lib/i18n).
 *
 * Verified against WP WPML 2026-06-13: regional variants (fr-ca, es-mx,
 * en-ca, en-uk) are byte-identical clones of their base, so storing them
 * separately would be pure duplication.
 */
export type ContentLanguage =
  | 'en'
  | 'ar-ae'
  | 'zh-hant'
  | 'de'
  | 'es'
  | 'fr'
  | 'it'
  | 'ja'
  | 'pt-pt'
  | 'ru';

/**
 * Front-end locales — the set of URL prefixes / language-switcher options
 * shown to users (14, matching WP's active WPML languages). Each resolves to
 * exactly one ContentLanguage via LOCALE_ALIASES. Every ContentLanguage is
 * also a Locale (it's its own front-end locale); the extras are the regional
 * variants that alias back.
 */
export type Locale =
  | ContentLanguage
  | 'en-ca'
  | 'en-uk'
  | 'es-mx'
  | 'fr-ca';

/** Translation dictionary shape (flat key-value) */
export type TranslationDict = Record<string, string>;
