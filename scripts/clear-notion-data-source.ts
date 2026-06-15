/**
 * Generic: archive all rows in a given data source.
 *
 * Usage:
 *   npx tsx scripts/clear-notion-data-source.ts <dataSourceKey>
 *
 *   <dataSourceKey> matches a property in notion-ids.json without the suffix —
 *   e.g. "articles" → uses ids.articlesDataSourceId.
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const key = process.argv[2];
if (!key) {
  console.error('Usage: clear-notion-data-source.ts <key>  (e.g. articles, products)');
  process.exit(1);
}

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);
const dataSourceId = ids[`${key}DataSourceId`];
if (!dataSourceId) throw new Error(`No data source for key "${key}"`);

console.log(`Clearing all rows in ${key} (${dataSourceId})`);

let cursor: string | undefined;
let total = 0;
let archived = 0;

do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: dataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    total++;
    try {
      await notion.pages.update({ page_id: page.id, in_trash: true } as any);
      archived++;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err: any) {
      console.error(`✗ ${page.id}: ${err.message}`);
    }
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`Archived ${archived}/${total} pages`);
