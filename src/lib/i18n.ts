import type { Locale, TranslationDict } from '../types';

import en from '../data/translations/en.json';
import arAe from '../data/translations/ar-ae.json';
import zhHant from '../data/translations/zh-hant.json';

const translations: Record<Locale, TranslationDict> = {
  en,
  'ar-ae': arAe,
  'zh-hant': zhHant,
};

/** Get a translated string by key for the given locale. */
export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

/** Return the text direction for a locale. */
export function getDir(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar-ae' ? 'rtl' : 'ltr';
}

/** Return the HTML lang attribute value for a locale. */
export function getLang(locale: Locale): string {
  const map: Record<Locale, string> = {
    en: 'en',
    'ar-ae': 'ar',
    'zh-hant': 'zh-Hant',
  };
  return map[locale];
}

/** All supported locales. */
export const locales: Locale[] = ['en', 'ar-ae', 'zh-hant'];

/** Default locale. */
export const defaultLocale: Locale = 'en';

/** Build a localized path. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/**
 * Return a shallow copy of a category object with `name` (and optionally
 * `description`) resolved to the given locale.
 *
 * Key convention: category.{group}.{id} → name
 *                 category.{group}.{id}.description → description
 */
export function localizeCategory<T extends { id: string; name: string; description?: string }>(
  locale: Locale,
  group: string,
  obj: T,
): T {
  return {
    ...obj,
    name: t(locale, `category.${group}.${obj.id}`),
    ...(obj.description !== undefined
      ? { description: t(locale, `category.${group}.${obj.id}.description`) }
      : {}),
  };
}
