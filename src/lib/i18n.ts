import type { Locale, ContentLanguage, TranslationDict } from '../types';

import en from '../data/translations/en.json';
import arAe from '../data/translations/ar-ae.json';
import zhHant from '../data/translations/zh-hant.json';
import de from '../data/translations/de.json';
import es from '../data/translations/es.json';
import fr from '../data/translations/fr.json';
import it from '../data/translations/it.json';
import ja from '../data/translations/ja.json';
import ptPt from '../data/translations/pt-pt.json';
import ru from '../data/translations/ru.json';

/**
 * Translation dictionaries, keyed by CONTENT language (the languages we
 * actually store). Front-end locales resolve to one of these via
 * LOCALE_ALIASES before any lookup.
 */
const translations: Record<ContentLanguage, TranslationDict> = {
  en,
  'ar-ae': arAe,
  'zh-hant': zhHant,
  de,
  es,
  fr,
  it,
  ja,
  'pt-pt': ptPt,
  ru,
};

/** The languages we store content for (one Notion row-set / file each). */
export const contentLanguages: ContentLanguage[] = [
  'en',
  'ar-ae',
  'zh-hant',
  'de',
  'es',
  'fr',
  'it',
  'ja',
  'pt-pt',
  'ru',
];

/**
 * Front-end locale → content language. A locale not listed here IS its own
 * content language (identity). Regional variants alias to their base: a
 * `fr-ca` URL renders `fr` content, an `es-mx` URL renders `es`, etc.
 */
export const LOCALE_ALIASES: Partial<Record<Locale, ContentLanguage>> = {
  'en-ca': 'en',
  'en-uk': 'en',
  'es-mx': 'es',
  'fr-ca': 'fr',
};

/** All front-end locales (URL prefixes + language-switcher options). */
export const locales: Locale[] = [
  'en',
  'en-ca',
  'en-uk',
  'es',
  'es-mx',
  'fr',
  'fr-ca',
  'de',
  'it',
  'ja',
  'pt-pt',
  'ru',
  'ar-ae',
  'zh-hant',
];

/** Default locale. */
export const defaultLocale: Locale = 'en';

/**
 * Resolve a front-end locale to the content language whose data/translations
 * back it. Identity for non-aliased locales.
 */
export function contentLang(locale: Locale): ContentLanguage {
  return LOCALE_ALIASES[locale] ?? (locale as ContentLanguage);
}

/** Get a translated string by key for the given locale. */
export function t(locale: Locale, key: string): string {
  const lang = contentLang(locale);
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

/** Return the text direction for a locale. */
export function getDir(locale: Locale): 'ltr' | 'rtl' {
  return contentLang(locale) === 'ar-ae' ? 'rtl' : 'ltr';
}

/** HTML lang attribute value per content language. */
const HTML_LANG: Record<ContentLanguage, string> = {
  en: 'en',
  'ar-ae': 'ar',
  'zh-hant': 'zh-Hant',
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  ja: 'ja',
  'pt-pt': 'pt-PT',
  ru: 'ru',
};

/**
 * HTML lang attribute. Regional variants keep their own BCP-47 tag (en-CA,
 * fr-CA) even though their content is the base language — the tag should
 * reflect the page's locale, not the content source.
 */
export function getLang(locale: Locale): string {
  // Regional variants: emit the proper BCP-47 region tag.
  const REGION: Partial<Record<Locale, string>> = {
    'en-ca': 'en-CA',
    'en-uk': 'en-GB',
    'es-mx': 'es-MX',
    'fr-ca': 'fr-CA',
  };
  return REGION[locale] ?? HTML_LANG[contentLang(locale)];
}

/** Human-readable language-switcher label per locale. */
const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'en-ca': 'English (CA)',
  'en-uk': 'English (UK)',
  es: 'Español',
  'es-mx': 'Español (MX)',
  fr: 'Français',
  'fr-ca': 'Français (CA)',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  'pt-pt': 'Português',
  ru: 'Русский',
  'ar-ae': 'العربية',
  'zh-hant': '繁體中文',
};

export function localeName(locale: Locale): string {
  return LOCALE_NAMES[locale] ?? locale;
}

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
