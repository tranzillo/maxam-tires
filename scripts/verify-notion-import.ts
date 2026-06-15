import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);

async function countAndSpotCheck(label: string, dataSourceId: string) {
  const counts: Record<string, number> = {};
  let cursor: string | undefined;
  let firstPage: any = null;

  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const lang = page.properties?.Language?.select?.name ?? 'unknown';
      counts[lang] = (counts[lang] || 0) + 1;
      if (!firstPage) firstPage = page;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`\n── ${label} ──`);
  for (const [lang, n] of Object.entries(counts)) {
    console.log(`  ${lang}: ${n}`);
  }
  console.log(`  Total: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);

  if (firstPage) {
    const t = firstPage.properties.Translations?.relation?.length ?? 0;
    const ind = firstPage.properties.Industries?.relation?.length;
    const apps = firstPage.properties.Applications?.relation?.length;
    const tt = firstPage.properties['Tire Type']?.relation?.length;
    const docs = firstPage.properties.Documents?.relation?.length;
    console.log(
      `  Sample row: Translations=${t}` +
        (ind !== undefined ? `, Industries=${ind}` : '') +
        (apps !== undefined ? `, Applications=${apps}` : '') +
        (tt !== undefined ? `, TireType=${tt}` : '') +
        (docs !== undefined ? `, Documents=${docs}` : '')
    );
  }
}

await countAndSpotCheck('Products', ids.productsDataSourceId);
await countAndSpotCheck('Industries', ids.industriesDataSourceId);
await countAndSpotCheck('Applications', ids.applicationsDataSourceId);
await countAndSpotCheck('Tire Types', ids.tireTypesDataSourceId);
await countAndSpotCheck('Articles', ids.articlesDataSourceId);
await countAndSpotCheck('Events', ids.eventsDataSourceId);
await countAndSpotCheck('Documents', ids.documentsDataSourceId);
await countAndSpotCheck('Testimonials', ids.testimonialsDataSourceId);
