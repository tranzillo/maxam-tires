/**
 * Archive Notion event rows whose WP IDs are no longer published in WordPress.
 * Runs after a fresh extraction so events.json reflects the current WP state.
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8'));

// Build set of currently-valid WP IDs from the freshly-extracted events JSON.
const currentWpIds = new Set<number>();
for (const locale of ['en', 'ar-ae', 'zh-hant']) {
  try {
    const rows = JSON.parse(
      readFileSync(join(import.meta.dirname, 'output', `events-${locale}.json`), 'utf8')
    );
    for (const r of rows) currentWpIds.add(r.wpId);
  } catch {}
}
console.log(`Current WP event IDs: ${[...currentWpIds].join(', ') || '(none)'}\n`);

// Walk Notion, archive rows whose wpId isn't in the current set.
let cursor: string | undefined;
let archived = 0;
let kept = 0;
do {
  const res: any = await (notion as any).dataSources.query({
    data_source_id: ids.eventsDataSourceId,
    start_cursor: cursor,
    page_size: 100,
  });
  for (const page of res.results) {
    const wpId = page.properties?.['WP ID']?.number;
    const title = page.properties?.Name?.title?.[0]?.plain_text;
    if (wpId == null) {
      console.log(`  ?  ${page.id} no wpId — skipping`);
      continue;
    }
    if (currentWpIds.has(wpId)) {
      kept++;
    } else {
      console.log(`  - archiving wpId=${wpId} "${title}"`);
      try {
        await notion.pages.update({ page_id: page.id, in_trash: true } as any);
        archived++;
        await new Promise((r) => setTimeout(r, 350));
      } catch (err: any) {
        console.error(`     failed: ${err.message}`);
      }
    }
  }
  cursor = res.has_more ? res.next_cursor : undefined;
} while (cursor);

console.log(`\nDone: ${archived} archived, ${kept} kept`);
