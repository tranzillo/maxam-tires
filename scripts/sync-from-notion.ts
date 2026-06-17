/**
 * Sync content from Notion → src/data/notion-content/*.json snapshots.
 * Run before `astro build` (or whenever editorial content has changed in Notion)
 * to refresh the static site.
 *
 * Snapshot files are committed to the repo so the Astro build is fully
 * offline — no Notion API calls during `astro build`.
 *
 * Usage:
 *   npx tsx scripts/sync-from-notion.ts
 *   npx tsx scripts/sync-from-notion.ts --without-blocks   # faster, skip page bodies
 */
import {
  fetchProducts,
  fetchIndustries,
  fetchApplications,
  fetchTireTypes,
  fetchArticles,
  fetchDocuments,
  fetchTestimonials,
  fetchEvents,
  fetchPages,
  fetchPagePromos,
  type RawProduct,
  type RawArticle,
  type RawTaxonomy,
  type RawDocument,
  type RawTestimonial,
  type RawEvent,
} from '../src/lib/notion/fetchers.js';
import { getNotionIds } from '../src/lib/notion/client.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'src', 'data', 'notion-content');
const BLOCKS_OUT = join(OUT, 'blocks');
mkdirSync(OUT, { recursive: true });
mkdirSync(BLOCKS_OUT, { recursive: true });

const withBlocks = !process.argv.includes('--without-blocks');

// --only-lang=de[,fr,...] restricts block-body fetching to those languages
// (metadata for all languages is still synced). Existing sidecars for other
// languages are left untouched, so this refreshes one language's bodies
// without re-fetching every language — the multi-language scaling fix.
const onlyLangArg = process.argv.find((a) => a.startsWith('--only-lang='));
const blockLangs: string[] | null = onlyLangArg
  ? onlyLangArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)
  : null;

function write(name: string, data: unknown) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  → wrote ${name}.json`);
}

/**
 * Pull `blocks` off each row, write them to a sidecar file keyed by
 * `<type>-<language>-<slug>.json`, and return the rows without blocks.
 *
 * Importing one giant rows-with-blocks JSON into Astro blows up memory
 * (53MB for products) since Astro inlines static imports. Sidecar files
 * are read at runtime via fs only when a detail page actually needs them.
 */
function splitBlocks<T extends { language: string; slug: string; blocks?: any[] }>(
  rows: T[],
  type: string
): T[] {
  return rows.map((row) => {
    if (row.blocks && row.blocks.length > 0) {
      const filename = `${type}-${row.language}-${row.slug}.json`;
      writeFileSync(join(BLOCKS_OUT, filename), JSON.stringify(row.blocks));
    }
    const { blocks, ...rest } = row as any;
    return rest as T;
  });
}

function indexBy<T>(rows: T[], keyFn: (r: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(keyFn(r), r);
  return m;
}

async function main() {
  console.log('Syncing from Notion...\n');

  console.log('── Taxonomies ──');
  const industries = await fetchIndustries();
  console.log(`  ${industries.length} industries`);
  const applications = await fetchApplications();
  console.log(`  ${applications.length} applications`);
  const tireTypes = await fetchTireTypes();
  console.log(`  ${tireTypes.length} tire types`);

  console.log('\n── Products ──');
  const products = await fetchProducts({ withBlocks, blockLangs });
  console.log(`  ${products.length} products${withBlocks ? ' (with bodies)' : ''}`);

  // Resources (articles + documents) are ENGLISH-ONLY (decision 2026-06-13).
  // WP never translated them — non-English rows are byte-identical English
  // passthrough that data.ts (RESOURCE_LANG='en') never reads. We drop them at
  // the source so the snapshot + block sidecars don't carry dead duplicates.
  const RESOURCE_LANG = 'en';

  console.log('\n── Articles (English-only) ──');
  const allArticles = await fetchArticles({ withBlocks, blockLangs });
  const articles = allArticles.filter((a) => a.language === RESOURCE_LANG);
  console.log(`  ${articles.length} articles (dropped ${allArticles.length - articles.length} non-en)`);

  console.log('\n── Documents (English-only) ──');
  const allDocuments = await fetchDocuments();
  const documents = allDocuments.filter((d) => d.language === RESOURCE_LANG);
  console.log(`  ${documents.length} documents (dropped ${allDocuments.length - documents.length} non-en)`);

  console.log('\n── Testimonials ──');
  const testimonials = await fetchTestimonials();
  console.log(`  ${testimonials.length} testimonials`);

  console.log('\n── Events ──');
  const events = await fetchEvents({ withBlocks });
  console.log(`  ${events.length} events${withBlocks ? ' (with bodies)' : ''}`);

  // Pages + Promos: Notion is the source of truth. The databases are
  // configured (scripts/output/notion-ids.json) and populated (see
  // scripts/import-pages-to-notion.ts), so a missing config or an empty
  // result is a hard error — we never silently serve stale seed content.
  // (The {pages,page-promos}.json snapshots are now build output, not a
  // hand-maintained fallback.)
  const ids = getNotionIds();

  console.log('\n── Pages ──');
  if (!ids.pagesDataSourceId) {
    throw new Error(
      'pagesDataSourceId is not set in scripts/output/notion-ids.json. ' +
        'Run scripts/create-notion-pages-dbs.ts to create the Pages database.'
    );
  }
  const pages = await fetchPages();
  if (pages.length === 0) {
    throw new Error(
      'Pages database is configured but returned 0 rows. Refusing to overwrite ' +
        'the snapshot with empty content. Check the Notion Pages database / token access.'
    );
  }
  console.log(`  ${pages.length} pages`);

  console.log('\n── Page Promos ──');
  if (!ids.pagePromosDataSourceId) {
    throw new Error(
      'pagePromosDataSourceId is not set in scripts/output/notion-ids.json. ' +
        'Run scripts/create-notion-pages-dbs.ts to create the Page Promos database.'
    );
  }
  const pagePromos = await fetchPagePromos();
  if (pagePromos.length === 0) {
    throw new Error(
      'Page Promos database is configured but returned 0 rows. Refusing to overwrite ' +
        'the snapshot with empty content. Check the Notion Page Promos database / token access.'
    );
  }
  console.log(`  ${pagePromos.length} page promos`);

  console.log('\n── Resolving relations to slugs ──');
  // Build a pageId → slug map for taxonomies and documents so the snapshot
  // never has to chase Notion page IDs at runtime — we resolve once here.
  const taxBySlug = (rows: RawTaxonomy[]) =>
    indexBy(rows, (r) => r.pageId);
  const indById = taxBySlug(industries);
  const appById = taxBySlug(applications);
  const ttById = taxBySlug(tireTypes);
  const docById = indexBy(documents, (r) => r.pageId);

  // Decorate products with slug-resolved relations.
  const productsResolved = products.map((p) => ({
    ...p,
    industries: p.industryIds.map((id) => indById.get(id)?.slug).filter(Boolean) as string[],
    applications: p.applicationIds.map((id) => appById.get(id)?.slug).filter(Boolean) as string[],
    tireType: p.tireTypeIds.map((id) => ttById.get(id)?.slug).filter(Boolean)[0] ?? null,
    documents: p.documentIds.map((id) => docById.get(id)?.slug).filter(Boolean) as string[],
  }));

  // Decorate articles with slug-resolved industries.
  const articlesResolved = articles.map((a) => ({
    ...a,
    industries: a.industryIds.map((id) => indById.get(id)?.slug).filter(Boolean) as string[],
  }));

  // Reverse-derive document industries: a document's industries are the union
  // of every referencing product's industries (per locale, since slugs are
  // language-stable but row identity is not). Editorial team can override
  // by adding an explicit Industries property to Documents in Notion later.
  console.log('\n── Deriving document industries from product references ──');
  const docIndustries = new Map<string, Set<string>>(); // key: `${locale}::${docSlug}`
  for (const p of productsResolved) {
    for (const docSlug of p.documents) {
      const key = `${p.language}::${docSlug}`;
      if (!docIndustries.has(key)) docIndustries.set(key, new Set());
      const set = docIndustries.get(key)!;
      for (const ind of p.industries) set.add(ind);
    }
  }
  // First pass: direct industry assignment from same-locale product references.
  let documentsResolved = documents.map((d) => {
    const key = `${d.language}::${d.slug}`;
    const inds = [...(docIndustries.get(key) ?? [])];
    return { ...d, industries: inds };
  });

  // Second pass: for any document without industries, inherit from siblings
  // sharing the same Translation Group (WPML trid). Arabic/Chinese product
  // pages frequently don't enumerate every PDF brochure their English
  // sibling does, even though the underlying brochure is the same artifact.
  const docsByTrid = new Map<number, typeof documentsResolved>();
  for (const d of documentsResolved) {
    if (d.trid == null) continue;
    if (!docsByTrid.has(d.trid)) docsByTrid.set(d.trid, []);
    docsByTrid.get(d.trid)!.push(d);
  }
  documentsResolved = documentsResolved.map((d) => {
    if (d.industries.length > 0 || d.trid == null) return d;
    const siblings = docsByTrid.get(d.trid) ?? [];
    const inherited = new Set<string>();
    for (const sib of siblings) {
      if (sib === d) continue;
      for (const ind of sib.industries) inherited.add(ind);
    }
    return inherited.size > 0 ? { ...d, industries: [...inherited] } : d;
  });

  const tagged = documentsResolved.filter((d) => d.industries.length > 0).length;
  console.log(`  ${tagged}/${documentsResolved.length} documents tagged with at least one industry (after sibling inheritance)`);

  // Split blocks into sidecar files, then write the lean row metadata.
  console.log('\n── Writing snapshots ──');
  const productsLean = splitBlocks(productsResolved, 'product');
  const articlesLean = splitBlocks(articlesResolved, 'article');
  const eventsLean = splitBlocks(events, 'event');
  // Long-form content pages (sustainability, legal…) carry a Notion block body;
  // split it into a sidecar like other content types. Templated pages have no
  // body and get no sidecar.
  const pagesLean = splitBlocks(pages, 'page');

  write('industries', industries);
  write('applications', applications);
  write('tire-types', tireTypes);
  write('products', productsLean);
  write('articles', articlesLean);
  write('documents', documentsResolved);
  write('testimonials', testimonials);
  write('events', eventsLean);

  // Pages + promos come from Notion like everything else (we already threw
  // above if either was missing/empty), so write them unconditionally.
  write('pages', pagesLean);
  write('page-promos', pagePromos);

  // Manifest with sync timestamp for build observability.
  write('_manifest', {
    syncedAt: new Date().toISOString(),
    withBlocks,
    counts: {
      industries: industries.length,
      applications: applications.length,
      tireTypes: tireTypes.length,
      products: products.length,
      articles: articles.length,
      documents: documents.length,
      testimonials: testimonials.length,
      events: events.length,
      pages: pages.length,
      pagePromos: pagePromos.length,
    },
  });

  console.log('\n✓ Sync complete');
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
