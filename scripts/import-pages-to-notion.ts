/**
 * Import the seed Pages + Page Promos content into Notion (all locales).
 *
 * One-time migration: reads src/data/notion-content/{pages,page-promos}.json
 * (the hand-written seed) and creates the corresponding rows in the Notion
 * Pages / Page Promos databases created by create-notion-pages-dbs.ts.
 *
 * Order matters:
 *   1. Import every Page row, recording seed pageId → Notion page id.
 *   2. Import every Promo row, resolving its `Page` relation through that map.
 *   3. Link Translations self-relations on both, via the trid → lang → id maps
 *      (written here, consumed by link-notion-siblings.ts).
 *
 * Idempotency: re-running creates duplicate rows (Notion has no natural key
 * here), so this is meant to run ONCE. If you need to re-run, clear the two
 * databases first.
 *
 * Usage:
 *   npx tsx scripts/import-pages-to-notion.ts [--dry-run]
 *   npx tsx scripts/link-notion-siblings.ts pages
 *   npx tsx scripts/link-notion-siblings.ts page-promos
 */
import { notion, decodeEntities } from './notion-client.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');
const IDS_FILE = join(OUT, 'notion-ids.json');
const SEED_DIR = join(import.meta.dirname, '..', 'src', 'data', 'notion-content');

const dryRun = process.argv.includes('--dry-run');

interface SeedPage {
  pageId: string;
  trid: number;
  language: string;
  title: string;
  slug: string;
  content: Record<string, string>;
}

interface SeedPromo {
  promoId: string;
  pageId: string;
  trid: number;
  language: string;
  order: number;
  tag: string | null;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
  imagePosition: string;
}

function richText(text: string | null | undefined) {
  if (!text) return [];
  return [{ type: 'text' as const, text: { content: decodeEntities(text).slice(0, 1900) } }];
}

/** Build the Pages row properties: standard fields + one rich-text per content key. */
function buildPageProps(page: SeedPage) {
  const props: any = {
    Name: { title: richText(page.title || page.slug) },
    Slug: { rich_text: richText(page.slug) },
    Language: { select: { name: page.language } },
    'Translation Group': { number: page.trid },
  };
  for (const [key, value] of Object.entries(page.content)) {
    if (!key.includes('.')) continue;
    props[key] = { rich_text: richText(value) };
  }
  return props;
}

/** Build the Page Promos row properties; `pageNotionId` resolves the Page relation. */
function buildPromoProps(promo: SeedPromo, pageNotionId: string | undefined) {
  const props: any = {
    Name: { title: richText(`${promo.heading} (${promo.language})`) },
    Slug: { rich_text: richText(promo.promoId) },
    Language: { select: { name: promo.language } },
    'Translation Group': { number: promo.trid },
    Order: { number: promo.order },
    Heading: { rich_text: richText(promo.heading) },
    Description: { rich_text: richText(promo.description) },
    'CTA Label': { rich_text: richText(promo.ctaLabel) },
    'CTA Href': { rich_text: richText(promo.ctaHref) },
    'Image Position': { rich_text: richText(promo.imagePosition) },
  };
  if (promo.tag) props.Tag = { rich_text: richText(promo.tag) };
  if (promo.image) props.Image = { url: promo.image };
  if (pageNotionId) props.Page = { relation: [{ id: pageNotionId }] };
  return props;
}

async function main() {
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const pagesDsId = ids.pagesDataSourceId;
  const promosDsId = ids.pagePromosDataSourceId;
  if (!pagesDsId || !promosDsId) {
    throw new Error('pagesDataSourceId / pagePromosDataSourceId missing — run create-notion-pages-dbs.ts first');
  }

  const seedPages: SeedPage[] = JSON.parse(readFileSync(join(SEED_DIR, 'pages.json'), 'utf8'));
  const seedPromos: SeedPromo[] = JSON.parse(
    readFileSync(join(SEED_DIR, 'page-promos.json'), 'utf8')
  );

  // seed pageId → Notion page id, so promos can resolve their owning Page.
  const seedPageToNotion: Record<string, string> = {};
  // trid → language → Notion page id, for the translation linker.
  const pagesMap: Record<string, Record<string, string>> = {};
  const promosMap: Record<string, Record<string, string>> = {};

  // ── 1. Pages ───────────────────────────────────────────────────────
  console.log(`Importing ${seedPages.length} pages${dryRun ? ' (dry run)' : ''}...`);
  for (const page of seedPages) {
    if (dryRun) {
      console.log(`  [dry-run] page ${page.slug} (${page.language}) — ${Object.keys(page.content).length} keys`);
      continue;
    }
    const created: any = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: pagesDsId } as any,
      properties: buildPageProps(page),
    });
    seedPageToNotion[page.pageId] = created.id;
    pagesMap[String(page.trid)] = pagesMap[String(page.trid)] || {};
    pagesMap[String(page.trid)][page.language] = created.id;
    console.log(`  ✓ page ${page.slug} (${page.language}) → ${created.id}`);
    await new Promise((r) => setTimeout(r, 350));
  }

  // ── 2. Page Promos ─────────────────────────────────────────────────
  console.log(`\nImporting ${seedPromos.length} page promos${dryRun ? ' (dry run)' : ''}...`);
  for (const promo of seedPromos) {
    const pageNotionId = seedPageToNotion[promo.pageId];
    if (dryRun) {
      console.log(`  [dry-run] promo "${promo.heading}" (${promo.language}) → Page ${pageNotionId ?? '??'}`);
      continue;
    }
    const created: any = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: promosDsId } as any,
      properties: buildPromoProps(promo, pageNotionId),
    });
    promosMap[String(promo.trid)] = promosMap[String(promo.trid)] || {};
    promosMap[String(promo.trid)][promo.language] = created.id;
    console.log(`  ✓ promo "${promo.heading}" (${promo.language}) → ${created.id}`);
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!dryRun) {
    writeFileSync(join(OUT, 'notion-pages-map.json'), JSON.stringify(pagesMap, null, 2));
    writeFileSync(join(OUT, 'notion-page-promos-map.json'), JSON.stringify(promosMap, null, 2));
    console.log(`\n✓ Wrote translation maps (notion-pages-map.json, notion-page-promos-map.json)`);
    console.log(`  Next: link siblings`);
    console.log(`    npx tsx scripts/link-notion-siblings.ts pages`);
    console.log(`    npx tsx scripts/link-notion-siblings.ts page-promos`);
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
