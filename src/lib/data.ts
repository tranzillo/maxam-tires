/**
 * Unified data access layer.
 * All query functions accept locale and return pre-translated objects.
 * Wraps mock data now — single seam to swap to Notion later.
 */
import { tires, industries, applications, getAllSizes as _getAllSizes, getAllRatings as _getAllRatings } from '../data/mock-tires';
import { articles } from '../data/mock-articles';
import { localizeCategory } from './i18n';
import type { Tire, Industry, Application, Article, ArticleType, Locale } from '../types';

// ── Private localization helpers ────────────────────────

function localizeTire(locale: Locale, tire: Tire): Tire {
  return {
    ...tire,
    industries: tire.industries.map((i) => localizeCategory(locale, 'industry', i)),
    applications: tire.applications.map((a) => localizeCategory(locale, 'application', a)),
    ...(tire.tireType ? { tireType: localizeCategory(locale, 'tireType', tire.tireType) } : {}),
  };
}

function localizeArticle(locale: Locale, article: Article): Article {
  return {
    ...article,
    industries: article.industries.map((i) => localizeCategory(locale, 'industry', i)),
  };
}

// ── Product queries ─────────────────────────────────────

export function getAllProducts(locale: Locale): Tire[] {
  return tires.map((t) => localizeTire(locale, t));
}

export function getProductBySlug(locale: Locale, slug: string): Tire | undefined {
  const tire = tires.find((t) => t.slug === slug);
  return tire ? localizeTire(locale, tire) : undefined;
}

export function getProductsByIndustry(locale: Locale, industrySlug: string): Tire[] {
  return tires
    .filter((t) => t.industries.some((i) => i.slug === industrySlug))
    .map((t) => localizeTire(locale, t));
}

export function getFeaturedProducts(locale: Locale, limit?: number): Tire[] {
  const sliced = limit ? tires.slice(0, limit) : [...tires];
  return sliced.map((t) => localizeTire(locale, t));
}

// ── Industry queries ────────────────────────────────────

export function getAllIndustries(locale: Locale): Industry[] {
  return industries.map((i) => localizeCategory(locale, 'industry', i));
}

export function getIndustryBySlug(locale: Locale, slug: string): Industry | undefined {
  const industry = industries.find((i) => i.slug === slug);
  return industry ? localizeCategory(locale, 'industry', industry) : undefined;
}

// ── Application queries ─────────────────────────────────

export function getAllApplications(locale: Locale): Application[] {
  return applications.map((a) => localizeCategory(locale, 'application', a));
}

// ── Article queries ─────────────────────────────────────

export function getAllArticles(locale: Locale): Article[] {
  return articles.map((a) => localizeArticle(locale, a));
}

export function getArticlesByType(locale: Locale, type: ArticleType): Article[] {
  return articles
    .filter((a) => a.type === type)
    .map((a) => localizeArticle(locale, a));
}

export function getArticlesByIndustry(locale: Locale, industrySlug: string): Article[] {
  return articles
    .filter((a) => a.industries.some((i) => i.slug === industrySlug))
    .map((a) => localizeArticle(locale, a));
}

export function getRecentArticles(locale: Locale, limit: number): Article[] {
  return [...articles]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((a) => localizeArticle(locale, a));
}

// ── Utilities ───────────────────────────────────────────

export function getAllSizes(): string[] {
  return _getAllSizes();
}

export function getAllRatings(): number[] {
  return _getAllRatings();
}
