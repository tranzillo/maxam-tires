/**
 * Single source of truth for the CONTENT languages we extract from WP and
 * import into Notion. Mirrors `contentLanguages` in src/lib/i18n.ts.
 *
 * Regional variants (en-ca, en-uk, es-mx, fr-ca) are NOT extracted — they
 * are byte-identical clones of their base language (verified 2026-06-13) and
 * are handled as front-end aliases in the app, not as stored content.
 *
 * Extract/import drivers accept an optional CLI arg to override this list
 * (e.g. run a single language: `... de`), so the German pilot and the
 * batch run share one code path.
 */
export const CONTENT_LANGUAGES = [
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
] as const;

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/**
 * Resolve the language list a driver should process: either the explicit
 * languages passed on the CLI (validated against CONTENT_LANGUAGES) or all
 * of them. Pass `process.argv.slice(2)` (or a filtered subset).
 */
export function resolveLanguages(argv: string[]): string[] {
  const requested = argv.filter((a) => !a.startsWith('--'));
  if (requested.length === 0) return [...CONTENT_LANGUAGES];
  const valid = new Set<string>(CONTENT_LANGUAGES);
  const bad = requested.filter((l) => !valid.has(l));
  if (bad.length) {
    throw new Error(
      `Unknown content language(s): ${bad.join(', ')}. ` +
        `Valid: ${CONTENT_LANGUAGES.join(', ')}`
    );
  }
  return requested;
}
