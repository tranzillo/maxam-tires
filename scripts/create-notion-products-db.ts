/**
 * One-time: ensure the Products database exists with the right schema.
 * Notion API v5 separates databases (containers) from data sources (where
 * properties + rows live). We create the database if missing, then update
 * its data source with the property schema.
 *
 * Re-running is idempotent — existing properties keep their IDs and only
 * missing ones are added.
 *
 * Usage:
 *   npx tsx scripts/create-notion-products-db.ts
 */
import { notion, PARENT_PAGE_ID } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

const PRODUCT_PROPERTIES: Record<string, any> = {
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
  Subheading: { rich_text: {} },
  Industries: { multi_select: { options: [] } },
  Applications: { multi_select: { options: [] } },
  'Tire Type': { select: { options: [] } },
  Sizes: { rich_text: {} },
  Rating: { number: { format: 'number' } },
  'Featured Image': { url: {} },
  Status: {
    select: {
      options: [
        { name: 'Published', color: 'green' },
        { name: 'Draft', color: 'yellow' },
        { name: 'Needs Review', color: 'red' },
      ],
    },
  },
  'WP ID': { number: { format: 'number' } },
};

async function main() {
  let ids: Record<string, string> = {};
  if (existsSync(IDS_FILE)) {
    ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  }

  let dbId = ids.productsDbId;
  let dataSourceId = ids.productsDataSourceId;

  if (!dbId) {
    console.log('Creating Products database under parent page', PARENT_PAGE_ID);
    const db: any = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: 'Products' } }],
    } as any);
    dbId = db.id;
    dataSourceId = db.data_sources?.[0]?.id;
    console.log(`✓ Created database: ${dbId}`);
    console.log(`  Initial data source: ${dataSourceId}`);
  } else {
    console.log(`Database already exists: ${dbId}`);
  }

  if (!dataSourceId) {
    // Re-fetch the database to find its initial data source.
    const db: any = await notion.databases.retrieve({ database_id: dbId! });
    dataSourceId = db.data_sources?.[0]?.id;
    if (!dataSourceId) throw new Error('No data source found on database');
    console.log(`Found data source: ${dataSourceId}`);
  }

  // Apply the schema to the data source.
  // Notion's update is a merge: existing properties stay, listed ones are
  // created/updated. Setting a property to `null` deletes it.
  console.log('Applying property schema to data source...');
  const updated: any = await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: PRODUCT_PROPERTIES,
  });
  console.log(
    `✓ Schema applied. Properties on data source: ${Object.keys(updated.properties || {}).join(', ')}`
  );

  ids.productsDbId = dbId!;
  ids.productsDataSourceId = dataSourceId!;
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  console.log(`Saved IDs to ${IDS_FILE}`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
