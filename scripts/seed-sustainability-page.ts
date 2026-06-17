/*
 * Seed the "Sustainability" page into the Notion Pages DB as a Notion BLOCK BODY
 * (not flat content columns — those don't scale past the templated homepage).
 * The bespoke route renders the body via NotionBlocks. Stat cards are encoded as
 * a convention: a `callout` whose text is "VALUE | LABEL" (e.g.
 * "16.43% | Reduced carbon emissions"); NotionBlocks styles those as stat cards.
 *
 * Content reinterpreted from the WP page (ID 30811) into our design system —
 * see scripts/output/sustainability-extract.json. English only for now.
 *
 * Idempotent: an existing 'sustainability' en page is cleared and re-seeded
 * (archive its blocks, append fresh) rather than duplicated.
 *
 * Usage: npx tsx scripts/seed-sustainability-page.ts [--dry-run]
 */
import { notion } from './notion-client.js';
import { getNotionIds } from '../src/lib/notion/client.js';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'sustainability';
const TRID = 100002; // homepage = 100001

const rt = (content: string, ann?: any) =>
  content ? [{ type: 'text' as const, text: { content }, annotations: ann }] : [];

const h2 = (text: string) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(text) } });
const h3 = (text: string) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: rt(text) } });
const p = (text: string) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(text) } });
const divider = () => ({ object: 'block', type: 'divider', divider: {} });
/** Stat-card convention: a callout whose text is "VALUE | LABEL". */
const stat = (value: string, label: string) => ({
  object: 'block', type: 'callout',
  callout: { rich_text: rt(`${value} | ${label}`), icon: { type: 'emoji', emoji: '📊' } },
});

// The page body, reinterpreted into our system from the WP narrative.
const BODY: any[] = [
  // Hero / commitment
  h2('Our Commitment'),
  p('At MAXAM Tire, a proud subsidiary of Sailun Group, we are dedicated to producing high-quality, sustainable specialty tires while prioritizing environmental stewardship. Our commitment is rooted in our core values and the mission of Sailun Group — leading the way in responsible manufacturing.'),
  divider(),

  // Technology
  h2('Engineered for a Greener Planet'),
  h3('EcoPoint3 Technology'),
  p("MAXAM's EcoPoint3 technology enhances tire performance by reducing rolling resistance, extending tire life, improving fuel efficiency, and lowering carbon emissions."),
  h3('Off-the-Road (OTR) Tires'),
  p('Our OTR tires are built with advanced materials and production techniques, engineered to reduce environmental impact while delivering exceptional performance.'),
  divider(),

  // Certifications + awards
  h2('Environmental Management & Energy Efficiency'),
  p("We're committed to responsible operations, recognized by independent standards and ratings:"),
  { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('ISO 50001 — Energy Management') } },
  { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('ISO 14001 — Environmental Management') } },
  { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('EcoVadis — Silver Medal') } },
  divider(),

  // Sustainable materials + goals (stat cards)
  h2('Sustainable Materials'),
  h3('Pioneers of Natural Rubber and Recycled Steel'),
  p("We're a global leader in working with sustainable materials, with clear targets for our material footprint:"),
  stat('40%', 'Sustainable material footprint by 2030'),
  stat('100%', 'Sustainable material footprint by 2050'),
  divider(),

  // Metrics (stat cards)
  h2("Reducing Our Environmental Impact"),
  p("In line with Sailun Group's goals, we have significantly lowered emissions and consumption across our production processes."),
  stat('16.43%', 'Reduced carbon emissions'),
  stat('10%', 'Reduced energy consumption'),
  h3('Water & Waste Management'),
  p('Our production processes conserve, recycle, and reuse water, and ensure proper hazardous-waste handling and disposal.'),
  divider(),

  // Closing
  h2('Our Responsibility'),
  p("Sustainability is a core part of MAXAM Tire's identity. We prioritize environmental preservation for future generations by integrating sustainable production practices — an evolving, ongoing journey of continuous innovation."),
];

function buildProperties() {
  return {
    Name: { title: rt('Sustainability') },
    Slug: { rich_text: rt(SLUG) },
    Language: { select: { name: 'en' } },
    'Translation Group': { number: TRID },
  } as any;
}

async function findExisting(dataSourceId: string): Promise<string | null> {
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 });
    for (const pg of res.results) {
      if (pg.properties?.Slug?.rich_text?.[0]?.plain_text === SLUG && pg.properties?.Language?.select?.name === 'en') return pg.id;
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return null;
}

async function clearBody(pageId: string) {
  const kids: any = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  for (const b of kids.results) await notion.blocks.update({ block_id: b.id, archived: true } as any);
}

async function main() {
  const ids = getNotionIds();
  const dsId = ids.pagesDataSourceId;
  if (!dsId) throw new Error('pagesDataSourceId missing');

  console.log(`Seeding "${SLUG}" page (en) — ${BODY.length} blocks${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) {
    BODY.forEach((b) => {
      const t = b.type;
      const txt = b[t]?.rich_text?.[0]?.text?.content ?? '';
      console.log(`  ${t}${txt ? ': ' + txt.slice(0, 60) : ''}`);
    });
    return;
  }

  const existing = await findExisting(dsId);
  let pageId: string;
  if (existing) {
    await notion.pages.update({ page_id: existing, properties: buildProperties() });
    await clearBody(existing);
    pageId = existing;
    console.log(`  updated + cleared existing page ${existing.slice(0, 8)}`);
  } else {
    const page: any = await notion.pages.create({ parent: { type: 'data_source_id', data_source_id: dsId } as any, properties: buildProperties() });
    pageId = page.id;
    console.log(`  created page ${pageId.slice(0, 8)}`);
  }

  for (let i = 0; i < BODY.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: BODY.slice(i, i + 100) as any });
  }
  console.log(`  ✓ appended ${BODY.length} blocks`);
  console.log('Next: npm run sync  (refresh pages snapshot + page sidecars), then build.');
}
main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
