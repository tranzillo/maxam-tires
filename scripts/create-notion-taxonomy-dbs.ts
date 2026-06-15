/**
 * Create three taxonomy databases under the parent page:
 *   - Industries
 *   - Applications
 *   - Tire Types
 *
 * Each follows the same pattern as Products: one row per (term × language),
 * linked by Translation Group (WPML trid). Slug is the language-stable
 * identifier the Astro site uses for routing.
 *
 * Idempotent: re-running updates the schema in place.
 *
 * Usage:
 *   npx tsx scripts/create-notion-taxonomy-dbs.ts
 */
import { notion, PARENT_PAGE_ID } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

interface TaxonomyDef {
  /** notion-ids.json key prefix — e.g. `industries` → `industriesDbId` */
  key: string;
  title: string;
  /** Extra properties beyond the standard Name/Slug/Language/Translation Group */
  extra: Record<string, any>;
}

const TAXONOMIES: TaxonomyDef[] = [
  {
    key: 'industries',
    title: 'Industries',
    extra: {
      Color: { rich_text: {} },
      'Background Image': { url: {} },
    },
  },
  {
    key: 'applications',
    title: 'Applications',
    extra: {
      Icon: { url: {} },
    },
  },
  {
    key: 'tireTypes',
    title: 'Tire Types',
    extra: {},
  },
];

const baseProperties = (extra: Record<string, any>) => ({
  Name: { title: {} },
  Slug: { rich_text: {} },
  Language: {
    select: {
      options: [
        { name: 'en', color: 'blue' },
        { name: 'ar-ae', color: 'green' },
        { name: 'zh-hant', color: 'orange' },
      ],
    },
  },
  'Translation Group': { number: { format: 'number' } },
  'WP Term ID': { number: { format: 'number' } },
  ...extra,
});

async function ensureDatabase(def: TaxonomyDef, ids: Record<string, string>) {
  const dbKey = `${def.key}DbId`;
  const dsKey = `${def.key}DataSourceId`;

  let dbId = ids[dbKey];
  let dataSourceId = ids[dsKey];

  if (!dbId) {
    console.log(`Creating ${def.title} database...`);
    const db: any = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: def.title } }],
    } as any);
    dbId = db.id;
    dataSourceId = db.data_sources?.[0]?.id;
    console.log(`  ✓ Database ${dbId}`);
  } else {
    console.log(`${def.title} already exists: ${dbId}`);
  }

  if (!dataSourceId) {
    const db: any = await notion.databases.retrieve({ database_id: dbId! });
    dataSourceId = db.data_sources?.[0]?.id;
  }
  if (!dataSourceId) throw new Error(`No data source for ${def.title}`);

  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: baseProperties(def.extra),
  });
  console.log(`  ✓ Schema applied to data source ${dataSourceId}`);

  ids[dbKey] = dbId!;
  ids[dsKey] = dataSourceId!;
}

async function main() {
  let ids: Record<string, string> = {};
  if (existsSync(IDS_FILE)) {
    ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  }

  for (const def of TAXONOMIES) {
    await ensureDatabase(def, ids);
  }

  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  console.log(`\nSaved IDs to ${IDS_FILE}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
