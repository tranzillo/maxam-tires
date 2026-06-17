/*
 * build-spec-headers.ts — extract per-product, per-language spec column headers
 * from the current product-specs.<lang>.json files into spec-headers.<lang>.json.
 *
 * Context (see docs/SPECS-NOTION-MIGRATION.md):
 *   Spec VALUES canonicalize on English (one value grid per product, reused for
 *   every language — laundering WP source corruption). Only the column HEADERS
 *   are translated. So the only per-language artifact we need is the header row.
 *
 * Output (per language):
 *   spec-headers.<lang>.json = { "<product-slug>": ["Größe","Typ","Felge",...] }
 *
 * Alignment rule (important): because every language renders the ENGLISH value
 * grid, each language's header array must have EXACTLY English's column count and
 * order. We align positionally to English:
 *   - same length  → use the language's own headers as-is.
 *   - different length (WPML left the table misaligned, e.g. ms705 de=12 vs
 *     en=10) → fall back to the ENGLISH headers for that product, so columns
 *     still line up with the (English) values. Logged so we can see how many.
 * Empty/blank translated headers also fall back to the English header.
 *
 * This script is one-time scaffolding feeding the Notion seed; it reads the
 * existing snapshots only, writes no Notion. Re-runnable.
 *
 * Usage: npx tsx scripts/build-spec-headers.ts [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CONTENT_LANGUAGES } from './content-languages.js';

const dryRun = process.argv.includes('--dry-run');
const DIR = join(process.cwd(), 'src', 'data', 'notion-content');

type Specs = Record<string, { headers: string[]; variants: unknown[] }>;

const en: Specs = JSON.parse(readFileSync(join(DIR, 'product-specs.en.json'), 'utf8'));

let totalFallbacks = 0;
const summary: string[] = [];

for (const lang of CONTENT_LANGUAGES) {
  const file = join(DIR, `product-specs.${lang}.json`);
  if (!existsSync(file)) {
    summary.push(`  skip ${lang}: no product-specs file`);
    continue;
  }
  const specs: Specs = JSON.parse(readFileSync(file, 'utf8'));
  const out: Record<string, string[]> = {};
  let products = 0;
  let mismatched = 0; // products where this lang fell back to English headers wholesale

  for (const slug of Object.keys(en)) {
    const enHeaders = en[slug].headers;
    const langEntry = specs[slug];

    if (lang === 'en' || !langEntry) {
      out[slug] = [...enHeaders];
      products++;
      continue;
    }

    if (langEntry.headers.length !== enHeaders.length) {
      // Misaligned translation — use English headers so columns match values.
      out[slug] = [...enHeaders];
      mismatched++;
      totalFallbacks++;
    } else {
      // Same shape: take translated header, fall back to English per blank cell.
      out[slug] = enHeaders.map((eh, i) => {
        const t = (langEntry.headers[i] ?? '').trim();
        return t || eh;
      });
    }
    products++;
  }

  if (!dryRun) {
    writeFileSync(join(DIR, `spec-headers.${lang}.json`), JSON.stringify(out, null, 2));
  }
  summary.push(`  ${lang}: ${products} products${mismatched ? `, ${mismatched} fell back to en headers (misaligned)` : ''}`);
}

console.log(`spec-headers built${dryRun ? ' (dry run — nothing written)' : ''}:`);
summary.forEach((s) => console.log(s));
console.log(`Total wholesale-fallback products across langs: ${totalFallbacks}`);
