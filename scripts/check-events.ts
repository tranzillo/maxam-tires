import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8'));

let cursor: string | undefined;
let total = 0;
do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.eventsDataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    total++;
    const wpId = page.properties?.['WP ID']?.number;
    const title = page.properties?.Name?.title?.[0]?.plain_text;
    const inTrash = page.in_trash;
    console.log(`  pageId=${page.id} wpId=${wpId} inTrash=${inTrash} ${title}`);
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);
console.log(`Total: ${total}`);
