/**
 * Compare current WP backup against what we already have in Notion.
 * Reports added / removed / unchanged content per type, plus newly-tagged
 * articles (industry via category taxonomy).
 *
 * Reads Notion snapshot from src/data/notion-content/ and queries WP DB
 * for the same content types.
 */
import { getConnection } from './db.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SNAPSHOT = join(process.cwd(), 'src', 'data', 'notion-content');

interface SnapshotRow { wpId?: number | null; trid?: number | null; language: string; slug: string; title?: string; }

function loadSnapshot(file: string): SnapshotRow[] {
  return JSON.parse(readFileSync(join(SNAPSHOT, file), 'utf8'));
}

const db = await getConnection();

console.log('═══════════════════════════════════════════════════════');
console.log('  WP backup ↔ Notion snapshot diff');
console.log('═══════════════════════════════════════════════════════\n');

// ── Helper: pull EN WP entries by post type with WPML language scoping ─
async function fetchWp(postType: string, language = 'en') {
  const [rows] = await db.query(
    `SELECT p.ID AS wpId, ic.trid, p.post_title AS title, p.post_name AS slug,
            p.post_status AS status, p.post_date AS publishedDate
     FROM wp_posts p
     JOIN wp_icl_translations ic
       ON ic.element_id = p.ID
       AND ic.element_type = CONCAT('post_', p.post_type)
     WHERE p.post_type = ?
       AND p.post_status = 'publish'
       AND ic.language_code = ?
     ORDER BY p.post_title`,
    [postType, language]
  );
  return rows as any[];
}

interface DiffResult {
  added: any[];
  removed: any[];
  shared: number;
}

function diff(wp: any[], snapshot: SnapshotRow[], locale: string): DiffResult {
  const wpByWpId = new Map(wp.map((r) => [r.wpId, r]));
  const snByWpId = new Map(
    snapshot.filter((r) => r.language === locale && r.wpId != null).map((r) => [r.wpId!, r])
  );

  const added = wp.filter((r) => !snByWpId.has(r.wpId));
  const removed = snapshot
    .filter((r) => r.language === locale && r.wpId != null)
    .filter((r) => !wpByWpId.has(r.wpId!));
  const shared = wp.filter((r) => snByWpId.has(r.wpId)).length;

  return { added, removed, shared };
}

async function compare(label: string, postType: string, snapshotFile: string) {
  const wp = await fetchWp(postType);
  const sn = loadSnapshot(snapshotFile);
  const r = diff(wp, sn, 'en');

  console.log(`── ${label} (post_type=${postType}, locale=en) ──`);
  console.log(`  WP: ${wp.length}  ·  Snapshot: ${sn.filter((x) => x.language === 'en').length}  ·  Shared: ${r.shared}`);
  console.log(`  + ${r.added.length} in WP not in snapshot`);
  if (r.added.length > 0 && r.added.length <= 25) {
    for (const a of r.added) console.log(`     [${a.wpId}] ${a.title}`);
  } else if (r.added.length > 0) {
    for (const a of r.added.slice(0, 10)) console.log(`     [${a.wpId}] ${a.title}`);
    console.log(`     ... and ${r.added.length - 10} more`);
  }
  console.log(`  - ${r.removed.length} in snapshot not in WP (deleted from WP)`);
  if (r.removed.length > 0 && r.removed.length <= 25) {
    for (const x of r.removed) console.log(`     [${x.wpId}] ${x.title}`);
  } else if (r.removed.length > 0) {
    for (const x of r.removed.slice(0, 10)) console.log(`     [${x.wpId}] ${x.title}`);
    console.log(`     ... and ${r.removed.length - 10} more`);
  }
  console.log();
}

// ── Per-locale summary ────────────────────────────────────────────────
async function compareAllLocales(label: string, postTypes: string[], snapshotFile: string) {
  const sn = loadSnapshot(snapshotFile);
  console.log(`── ${label} per-locale ──`);
  for (const locale of ['en', 'ar-ae', 'zh-hant']) {
    let wpAll: any[] = [];
    for (const pt of postTypes) {
      const [rows] = await db.query(
        `SELECT p.ID AS wpId, p.post_title AS title, p.post_type
         FROM wp_posts p
         JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
         WHERE p.post_type = ? AND p.post_status = 'publish' AND ic.language_code = ?`,
        [pt, locale]
      );
      wpAll.push(...(rows as any[]));
    }
    const snLocale = sn.filter((x) => x.language === locale);
    const r = diff(wpAll, snLocale, locale);
    console.log(`  ${locale}: WP=${wpAll.length} snap=${snLocale.length} +${r.added.length} -${r.removed.length}`);
  }
  console.log();
}

await compareAllLocales('Products', ['tire'], 'products.json');
await compareAllLocales('Articles', ['news', 'post'], 'articles.json');
await compareAllLocales('Documents', ['product-sheet', 'brochure'], 'documents.json');
await compareAllLocales('Events', ['event'], 'events.json');

// ── Products ───────────────────────────────────────────────────────────
await compare('Products', 'tire', 'products.json');

// ── Articles (news + blog merged) ──────────────────────────────────────
{
  const [news] = await db.query(
    `SELECT p.ID AS wpId, ic.trid, p.post_title AS title, p.post_name AS slug,
            p.post_status, p.post_type
     FROM wp_posts p
     JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
     WHERE p.post_type IN ('news', 'post') AND p.post_status = 'publish' AND ic.language_code = 'en'
     ORDER BY p.post_title`
  );
  const wpAll = news as any[];
  const sn = loadSnapshot('articles.json');
  const r = diff(wpAll, sn, 'en');
  console.log(`── Articles (news + blog, locale=en) ──`);
  console.log(`  WP: ${wpAll.length}  ·  Snapshot: ${sn.filter((x) => x.language === 'en').length}  ·  Shared: ${r.shared}`);
  console.log(`  + ${r.added.length} in WP not in snapshot`);
  if (r.added.length > 0 && r.added.length <= 30) {
    for (const a of r.added) console.log(`     [${a.wpId}] [${a.post_type}] ${a.title}`);
  } else if (r.added.length > 0) {
    for (const a of r.added.slice(0, 15)) console.log(`     [${a.wpId}] [${a.post_type}] ${a.title}`);
    console.log(`     ... and ${r.added.length - 15} more`);
  }
  console.log(`  - ${r.removed.length} in snapshot not in WP`);
  if (r.removed.length > 0 && r.removed.length <= 15) {
    for (const x of r.removed) console.log(`     [${x.wpId}] ${x.title}`);
  }
  console.log();
}

// ── Documents (product-sheet + brochure) ───────────────────────────────
{
  const [docs] = await db.query(
    `SELECT p.ID AS wpId, ic.trid, p.post_title AS title, p.post_name AS slug,
            p.post_type
     FROM wp_posts p
     JOIN wp_icl_translations ic ON ic.element_id = p.ID AND ic.element_type = CONCAT('post_', p.post_type)
     WHERE p.post_type IN ('product-sheet', 'brochure') AND p.post_status = 'publish' AND ic.language_code = 'en'
     ORDER BY p.post_title`
  );
  const wpAll = docs as any[];
  const sn = loadSnapshot('documents.json');
  const r = diff(wpAll, sn, 'en');
  console.log(`── Documents (sheets + brochures, locale=en) ──`);
  console.log(`  WP: ${wpAll.length}  ·  Snapshot: ${sn.filter((x) => x.language === 'en').length}  ·  Shared: ${r.shared}`);
  console.log(`  + ${r.added.length} added`);
  if (r.added.length > 0 && r.added.length <= 25) {
    for (const a of r.added) console.log(`     [${a.wpId}] [${a.post_type}] ${a.title}`);
  } else if (r.added.length > 0) {
    for (const a of r.added.slice(0, 15)) console.log(`     [${a.wpId}] [${a.post_type}] ${a.title}`);
    console.log(`     ... and ${r.added.length - 15} more`);
  }
  console.log(`  - ${r.removed.length} removed`);
  console.log();
}

// ── Events ──────────────────────────────────────────────────────────────
await compare('Events', 'event', 'events.json');

// ── Testimonials ────────────────────────────────────────────────────────
await compare('Testimonials', 'testimonial', 'testimonials.json');

await db.end();

console.log('═══════════════════════════════════════════════════════');
console.log('  Diff complete');
console.log('═══════════════════════════════════════════════════════');
