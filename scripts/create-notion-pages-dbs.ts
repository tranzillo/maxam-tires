/**
 * Create the Pages + Page Promos databases (idempotent).
 *
 * These are the last two content types still served from a hand-written
 * seed file (src/data/notion-content/{pages,page-promos}.json). Once these
 * databases exist and are populated (see import-pages-to-notion.ts), the
 * sync script pulls them from Notion like every other content type and the
 * seed becomes a dev-only artifact.
 *
 * Schema notes:
 *   - Pages: editorial enters per-route marketing copy as one rich-text
 *     property PER dotted content key (e.g. "hero.lead", "sustainability.body").
 *     fetchPages() collects any property whose name contains a dot, so the
 *     property set here is derived from the seed file's content keys — that
 *     guarantees the DB schema matches exactly what the fetcher reads.
 *   - Page Promos: the repeating cards owned by a Page. Carries a `Page`
 *     relation pointing back at the owning Pages row, plus the flat card
 *     fields fetchPagePromos() reads.
 *
 * Writes the new data source IDs into scripts/output/notion-ids.json under
 * `pagesDbId/pagesDataSourceId/pagePromosDbId/pagePromosDataSourceId`, which
 * getNotionIds() already declares.
 *
 * Usage:
 *   npx tsx scripts/create-notion-pages-dbs.ts
 */
import { notion, PARENT_PAGE_ID } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');
const IDS_FILE = join(OUT, 'notion-ids.json');
const SEED_DIR = join(import.meta.dirname, '..', 'src', 'data', 'notion-content');

const LANG_OPTIONS = {
  select: {
    options: [
      { name: 'en', color: 'blue' as const },
      { name: 'ar-ae', color: 'green' as const },
      { name: 'zh-hant', color: 'orange' as const },
    ],
  },
};

/**
 * Collect the union of every dotted content key across all locales in the
 * seed pages file. Each becomes a rich-text property on the Pages DB so the
 * schema is exactly the set fetchPages() looks for.
 */
function pageContentKeys(): string[] {
  const seed = JSON.parse(
    readFileSync(join(SEED_DIR, 'pages.json'), 'utf8')
  ) as Array<{ content: Record<string, string> }>;
  const keys = new Set<string>();
  for (const page of seed) {
    for (const key of Object.keys(page.content)) {
      if (key.includes('.')) keys.add(key);
    }
  }
  return [...keys].sort();
}

function pagesProperties(): Record<string, any> {
  const props: Record<string, any> = {
    Name: { title: {} },
    Slug: { rich_text: {} },
    Language: { ...LANG_OPTIONS },
    'Translation Group': { number: { format: 'number' } },
  };
  // One rich-text property per content key (hero.lead, sustainability.body, …).
  for (const key of pageContentKeys()) {
    props[key] = { rich_text: {} };
  }
  return props;
}

const PROMO_PROPERTIES: Record<string, any> = {
  Name: { title: {} },
  Slug: { rich_text: {} },
  Language: { ...LANG_OPTIONS },
  'Translation Group': { number: { format: 'number' } },
  Order: { number: { format: 'number' } },
  Tag: { rich_text: {} },
  Heading: { rich_text: {} },
  Description: { rich_text: {} },
  'CTA Label': { rich_text: {} },
  'CTA Href': { rich_text: {} },
  Image: { url: {} },
  'Image Position': { rich_text: {} },
};

/** Create the database if it doesn't exist yet; return {dbId, dataSourceId}. */
async function ensureDb(
  key: string,
  title: string,
  ids: Record<string, string>
): Promise<{ dbId: string; dataSourceId: string }> {
  const dbKey = `${key}DbId`;
  const dsKey = `${key}DataSourceId`;
  let dbId = ids[dbKey];
  let dataSourceId = ids[dsKey];

  if (!dbId) {
    console.log(`Creating ${title}...`);
    const db: any = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: title } }],
    } as any);
    dbId = db.id;
    dataSourceId = db.data_sources?.[0]?.id;
    console.log(`  ✓ ${dbId}`);
  } else {
    console.log(`${title} already exists: ${dbId}`);
  }

  if (!dataSourceId) {
    const db: any = await notion.databases.retrieve({ database_id: dbId! });
    dataSourceId = db.data_sources?.[0]?.id;
  }

  ids[dbKey] = dbId!;
  ids[dsKey] = dataSourceId!;
  return { dbId: dbId!, dataSourceId: dataSourceId! };
}

/** Apply a property schema to a data source. */
async function applySchema(dataSourceId: string, properties: Record<string, any>) {
  await (notion as any).dataSources.update({ data_source_id: dataSourceId, properties });
  console.log(`  ✓ Schema applied (${Object.keys(properties).length} properties)`);
}

/** Add a self-referential Translations relation. */
async function addTranslationsRelation(dataSourceId: string) {
  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      Translations: { relation: { data_source_id: dataSourceId, single_property: {} } },
    },
  });
  console.log(`  ✓ Translations self-relation added`);
}

async function main() {
  let ids: Record<string, string> = {};
  if (existsSync(IDS_FILE)) ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));

  // ── Pages ────────────────────────────────────────────────────────
  const pages = await ensureDb('pages', 'Pages', ids);
  await applySchema(pages.dataSourceId, pagesProperties());
  await addTranslationsRelation(pages.dataSourceId);

  // ── Page Promos ──────────────────────────────────────────────────
  const promos = await ensureDb('pagePromos', 'Page Promos', ids);
  await applySchema(promos.dataSourceId, PROMO_PROPERTIES);
  await addTranslationsRelation(promos.dataSourceId);

  // The Promo → Page relation can only be added once the Pages data source
  // exists, so it's applied here as a second update on the promos schema.
  await (notion as any).dataSources.update({
    data_source_id: promos.dataSourceId,
    properties: {
      Page: { relation: { data_source_id: pages.dataSourceId, single_property: {} } },
    },
  });
  console.log(`  ✓ Page Promos → Pages relation added`);

  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  console.log(`\n✓ Wrote IDs to ${IDS_FILE}`);
  console.log(`    pagesDataSourceId      = ${ids.pagesDataSourceId}`);
  console.log(`    pagePromosDataSourceId = ${ids.pagePromosDataSourceId}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
