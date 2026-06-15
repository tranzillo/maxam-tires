import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8'));

const newWpIds = [39886, 39467, 39682, 39089, 39758, 39582, 39217];

let cursor: string | undefined;
do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.articlesDataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    const wpId = page.properties?.['WP ID']?.number;
    if (newWpIds.includes(wpId)) {
      const title = page.properties?.Name?.title?.[0]?.plain_text;
      const inds = page.properties?.Industries?.relation ?? [];
      const trans = page.properties?.Translations?.relation ?? [];
      console.log(`  wpId=${wpId} title="${title?.slice(0, 50)}" industries=${inds.length} translations=${trans.length}`);
    }
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);
