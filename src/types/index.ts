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

/** Supported locale codes */
export type Locale = 'en' | 'ar-ae' | 'zh-hant';

/** Translation dictionary shape (flat key-value) */
export type TranslationDict = Record<string, string>;
