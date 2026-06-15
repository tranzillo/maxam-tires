/**
 * Create Events, Documents, Testimonials databases (idempotent).
 * Each has the standard Translations self-relation + per-type properties.
 *
 * Usage:
 *   npx tsx scripts/create-notion-content-dbs.ts
 */
import { notion, PARENT_PAGE_ID } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

interface DbSpec {
  key: string;
  title: string;
  properties: Record<string, any>;
}

const SPECS: DbSpec[] = [
  {
    key: 'events',
    title: 'Events',
    properties: {
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
      'Start Date': { date: {} },
      'End Date': { date: {} },
      'Featured Image': { url: {} },
      Status: {
        select: {
          options: [
            { name: 'Published', color: 'green' },
            { name: 'Draft', color: 'yellow' },
          ],
        },
      },
      'WP ID': { number: { format: 'number' } },
    },
  },
  {
    key: 'documents',
    title: 'Documents',
    properties: {
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
      Type: {
        select: {
          options: [
            { name: 'product-sheet', color: 'blue' },
            { name: 'brochure', color: 'purple' },
          ],
        },
      },
      'File URL': { url: {} },
      Thumbnail: { url: {} },
      Status: {
        select: {
          options: [
            { name: 'Published', color: 'green' },
            { name: 'Draft', color: 'yellow' },
          ],
        },
      },
      'WP ID': { number: { format: 'number' } },
    },
  },
  {
    key: 'testimonials',
    title: 'Testimonials',
    properties: {
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
      Quote: { rich_text: {} },
      'Author Name': { rich_text: {} },
      'Author Title': { rich_text: {} },
      'Author Company': { rich_text: {} },
      Status: {
        select: {
          options: [
            { name: 'Published', color: 'green' },
            { name: 'Draft', color: 'yellow' },
          ],
        },
      },
      'WP ID': { number: { format: 'number' } },
    },
  },
];

async function ensure(spec: DbSpec, ids: Record<string, string>) {
  const dbKey = `${spec.key}DbId`;
  const dsKey = `${spec.key}DataSourceId`;

  let dbId = ids[dbKey];
  let dataSourceId = ids[dsKey];

  if (!dbId) {
    console.log(`Creating ${spec.title}...`);
    const db: any = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: spec.title } }],
    } as any);
    dbId = db.id;
    dataSourceId = db.data_sources?.[0]?.id;
    console.log(`  ✓ ${dbId}`);
  } else {
    console.log(`${spec.title} already exists: ${dbId}`);
  }

  if (!dataSourceId) {
    const db: any = await notion.databases.retrieve({ database_id: dbId! });
    dataSourceId = db.data_sources?.[0]?.id;
  }

  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: spec.properties,
  });
  console.log(`  ✓ Schema applied`);

  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      Translations: { relation: { data_source_id: dataSourceId, single_property: {} } },
    },
  });
  console.log(`  ✓ Translations self-relation added`);

  ids[dbKey] = dbId!;
  ids[dsKey] = dataSourceId!;
}

async function main() {
  let ids: Record<string, string> = {};
  if (existsSync(IDS_FILE)) ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));

  for (const spec of SPECS) await ensure(spec, ids);

  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
