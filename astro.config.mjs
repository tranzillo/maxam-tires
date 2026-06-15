// @ts-check
import { defineConfig } from 'astro/config';

// NOTE: locale routing is handled entirely by our own getStaticPaths over the
// 14 front-end locales (src/lib/i18n.ts) — Astro's built-in i18n integration is
// not used (its locales list was stale at 3). Tailwind was removed 2026-06-13;
// all styling is plain central CSS (src/styles/).
export default defineConfig({});
