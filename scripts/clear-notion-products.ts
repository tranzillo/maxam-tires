/**
 * Archive (move to trash) all pages in the Products data source.
 * Use before re-running a full import to avoid duplicates.
 *
 * Usage:
 *   npx tsx scripts/clear-notion-products.ts
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);
const dataSourceId = ids.productsDataSourceId;
if (!dataSourceId) throw new Error('productsDataSourceId missing');

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
