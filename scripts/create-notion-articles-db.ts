/**
 * Create / update the Articles Notion database (news + blog merged).
 *
 * Idempotent: re-run safely.
 *
 * Usage:
 *   npx tsx scripts/create-notion-articles-db.ts
 */
import { notion, PARENT_PAGE_ID } from './notion-client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const IDS_FILE = join(import.meta.dirname, 'output', 'notion-ids.json');

const ARTICLE_PROPERTIES = {
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
        { name: 'blog', color: 'purple' },
        { name: 'press-release', color: 'pink' },
        { name: 'in-the-news', color: 'gray' },
      ],
    },
  },
  Excerpt: { rich_text: {} },
  'Published Date': { date: {} },
  'External Link': { url: {} },
  'Featured Image': { url: {} },
  Author: { rich_text: {} },
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
  if (existsSync(IDS_FILE)) ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));

  let dbId = ids.articlesDbId;
  let dataSourceId = ids.articlesDataSourceId;

  if (!dbId) {
    console.log('Creating Articles database...');
    const db: any = await notion.databases.create({
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: 'Articles' } }],
    } as any);
    dbId = db.id;
    dataSourceId = db.data_sources?.[0]?.id;
    console.log(`  ✓ ${dbId}`);
  } else {
    console.log(`Articles already exists: ${dbId}`);
  }

  if (!dataSourceId) {
    const db: any = await notion.databases.retrieve({ database_id: dbId! });
    dataSourceId = db.data_sources?.[0]?.id;
  }

  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: ARTICLE_PROPERTIES,
  });
  console.log('  ✓ Schema applied');

  // Self-relation for Translations.
  await (notion as any).dataSources.update({
    data_source_id: dataSourceId,
    properties: {
      Translations: {
        relation: { data_source_id: dataSourceId, single_property: {} },
      },
    },
  });
  console.log('  ✓ Translations self-relation added');

  ids.articlesDbId = dbId!;
  ids.articlesDataSourceId = dataSourceId!;
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
