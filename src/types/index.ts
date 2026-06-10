/** Industry classification for tires */
export interface Industry {
  id: string;
  slug: string;
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

/** Supported locale codes */
export type Locale = 'en' | 'ar-ae' | 'zh-hant';

/** Translation dictionary shape (flat key-value) */
export type TranslationDict = Record<string, string>;
