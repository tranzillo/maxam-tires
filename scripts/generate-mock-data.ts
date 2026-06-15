/**
 * Generate expanded mock data from WP extraction.
 * Reads scripts/output/tires-en.json and outputs a new src/data/mock-tires.ts
 * with ~20 real products across diverse industries.
 *
 * Run: npx tsx scripts/generate-mock-data.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const tiresRaw = JSON.parse(readFileSync(join(ROOT, 'scripts/output/tires-en.json'), 'utf-8'));
const industriesRaw = JSON.parse(readFileSync(join(ROOT, 'scripts/output/industries.json'), 'utf-8'));

// English industry names we care about
const EN_INDUSTRY_NAMES = [
  'Agricultural Tires', 'Construction Tires', 'Mining Tires',
  'Off-the-Road Tires', 'Forestry Tires', 'Rubber Tracks',
  'Underground Mining Tires', 'Solid OTR Tires', 'Truck and Bus Radial Tires',
];

// Normalize locale-variant industry slugs to a canonical English slug
const SLUG_NORMALIZE: Record<string, string> = {
  'rubber-tracks-en-ca': 'rubber-tracks',
  'rubber-tracks-en-uk': 'rubber-tracks',
  'rubber-tracks-ar-ae': 'rubber-tracks',
  'rubber-tracks-zh-hant': 'rubber-tracks',
  'rubber-tracks-fr': 'rubber-tracks',
  'rubber-tracks-fr-ca': 'rubber-tracks',
  'rubber-tracks-de': 'rubber-tracks',
  'rubber-tracks-it': 'rubber-tracks',
  'rubber-tracks-ja': 'rubber-tracks',
  'rubber-tracks-ru': 'rubber-tracks',
  'rubber-tracks-es': 'rubber-tracks',
  'rubber-tracks-es-mx': 'rubber-tracks',
  'rubber-tracks-pt-pt': 'rubber-tracks',
  'tbr-ar-ae': 'tbr-tires',
  'tbr-tires-zh-hant': 'tbr-tires',
  'tbr-tires-en-ca': 'tbr-tires',
  'tbr-tires-en-uk': 'tbr-tires',
};
function normalizeSlug(slug: string): string {
  return SLUG_NORMALIZE[slug] || slug;
}

// Industry colors from the WP extraction (English slugs only)
const industryColors: Record<string, string> = {};
for (const ind of industriesRaw) {
  if (ind.color) industryColors[ind.slug] = ind.color;
}
// Fallback colors
const FALLBACK_COLORS: Record<string, string> = {
  'agricultural-tires': '#009042',
  'construction-tires': '#f79425',
  'mining-tires': '#65686d',
  'off-the-road-tires': '#6a1b9a',
  'forestry-tires': '#558b2f',
  'rubber-tracks': '#0077c8',
  'underground-mining-tires': '#4a4a4a',
  'solid-otr-tires': '#e65100',
  'truck-and-bus-radial-tires': '#1c2858',
  'industrial-forklift-tires': '#e65100',
};

// Deduplicate by slug, keep only products with English industry names
const seen = new Set<string>();
const enProducts = tiresRaw.filter((t: any) => {
  if (seen.has(t.slug)) return false;
  if (!t.industries?.length) return false;
  const hasEn = t.industries.some((i: any) => EN_INDUSTRY_NAMES.includes(i.name));
  if (!hasEn) return false;
  seen.add(t.slug);
  return true;
});

// Pick diverse products
const targets: Record<string, number> = {
  'Mining Tires': 3,
  'Construction Tires': 3,
  'Agricultural Tires': 3,
  'Off-the-Road Tires': 2,
  'Forestry Tires': 2,
  'Rubber Tracks': 2,
  'Truck and Bus Radial Tires': 2,
  'Underground Mining Tires': 1,
  'Solid OTR Tires': 1,
};

const pickedSlugs = new Set<string>();
const picks: any[] = [];

for (const [indName, count] of Object.entries(targets)) {
  const matching = enProducts.filter((t: any) =>
    !pickedSlugs.has(t.slug) &&
    t.industries.some((i: any) => i.name === indName) &&
    t.features?.length > 0 &&
    t.sizes?.length > 0
  );
  for (let i = 0; i < Math.min(count, matching.length); i++) {
    pickedSlugs.add(matching[i].slug);
    picks.push(matching[i]);
  }
}

// Collect unique industries and applications from picked products
const industryMap = new Map<string, { slug: string; name: string; color: string }>();
const applicationMap = new Map<string, { slug: string; name: string; industryIds: string[] }>();

for (const product of picks) {
  for (const ind of product.industries) {
    if (!EN_INDUSTRY_NAMES.includes(ind.name)) continue;
    const slug = normalizeSlug(ind.slug);
    if (!industryMap.has(slug)) {
      const color = industryColors[ind.slug] || industryColors[slug] || FALLBACK_COLORS[slug] || '#65686d';
      // Clean up the name: remove " Tires" suffix for display
      const displayName = ind.name.replace(/ Tires$/, '');
      industryMap.set(slug, { slug, name: displayName, color });
    }
  }
  for (const app of product.applications || []) {
    // Only include English applications (no locale suffix in slug)
    const isLocalized = /-(?:zh-hant|ar-ae|fr|de|it|ja|ru|es|pt|en-ca|en-uk|fr-ca|es-mx|pt-pt)$/.test(app.slug);
    if (isLocalized) continue;
    if (!applicationMap.has(app.slug)) {
      const relatedIndustries = product.industries
        .filter((i: any) => EN_INDUSTRY_NAMES.includes(i.name))
        .map((i: any) => normalizeSlug(i.slug));
      applicationMap.set(app.slug, { slug: app.slug, name: app.name, industryIds: [...new Set(relatedIndustries)] });
    } else {
      // Merge industry IDs
      const existing = applicationMap.get(app.slug)!;
      for (const ind of product.industries) {
        const normSlug = normalizeSlug(ind.slug);
        if (EN_INDUSTRY_NAMES.includes(ind.name) && !existing.industryIds.includes(normSlug)) {
          existing.industryIds.push(normSlug);
        }
      }
    }
  }
}

// Generate the output file
const industries = [...industryMap.values()];
const applications = [...applicationMap.values()];

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function formatIndustryRef(slug: string): string {
  const idx = industries.findIndex(i => i.slug === slug);
  return idx >= 0 ? `industries[${idx}]` : `industries[0]`;
}

function formatApplicationRef(slug: string): string {
  const idx = applications.findIndex(a => a.slug === slug);
  return idx >= 0 ? `applications[${idx}]` : `applications[0]`;
}

let output = `/**
 * Mock product data for the vertical slice.
 * Generated from WP extraction data — ${picks.length} real products.
 * This will be replaced by Notion API fetches once the CMS is set up.
 *
 * To regenerate: npx tsx scripts/generate-mock-data.ts
 */
import type { Industry, Application, Tire } from '../types';

/* ── Industries ─────────────────────────────────────────── */

export const industries: Industry[] = [
${industries.map(i => `  { id: '${i.slug}', slug: '${i.slug}', name: '${escapeStr(i.name)}', color: '${i.color}' },`).join('\n')}
];

/* ── Applications ───────────────────────────────────────── */

export const applications: Application[] = [
${applications.map(a => `  { id: '${a.slug}', slug: '${a.slug}', name: '${escapeStr(a.name)}', industryIds: [${a.industryIds.map(id => `'${id}'`).join(', ')}] },`).join('\n')}
];

/* ── Products ───────────────────────────────────────────── */

export const tires: Tire[] = [
`;

for (const product of picks) {
  const enIndustries = product.industries.filter((i: any) => EN_INDUSTRY_NAMES.includes(i.name));
  const enApps = (product.applications || []).filter((a: any) => {
    const isLocalized = /-(?:zh-hant|ar-ae|fr|de|it|ja|ru|es|pt|en-ca|en-uk|fr-ca|es-mx|pt-pt)$/.test(a.slug);
    return !isLocalized;
  });

  const description = (product.details || product.content || '').replace(/\s+/g, ' ').trim();
  const subheading = product.subheading || '';

  output += `  {
    id: '${product.slug}',
    slug: '${product.slug}',
    title: '${escapeStr(product.title)}',
    subheading: '${escapeStr(subheading)}',
    description: '${escapeStr(description.slice(0, 300))}',
    industries: [${enIndustries.map((i: any) => formatIndustryRef(normalizeSlug(i.slug))).join(', ')}],
    applications: [${enApps.map((a: any) => formatApplicationRef(a.slug)).join(', ')}],
    tireType: ${product.tireTypes?.length ? `{ id: '${product.tireTypes[0].slug}', slug: '${product.tireTypes[0].slug}', name: '${escapeStr(product.tireTypes[0].name)}' }` : 'undefined'},
    sizes: [${product.sizes.map((s: string) => `'${escapeStr(s)}'`).join(', ')}],
    rating: ${product.rating || 5},
    features: [
${(product.features || []).map((f: string) => `      '${escapeStr(f)}',`).join('\n')}
    ],
    specifications: [],
    specTable: ${product.specTable ? `{
      headers: ${JSON.stringify(product.specTable.headers)},
      rows: ${JSON.stringify(product.specTable.rows)},
    }` : 'undefined'},
    galleryImages: [],
    documents: [],
  },
`;
}

output += `];

/** Look up a product by slug. */
export function getTireBySlug(slug: string): Tire | undefined {
  return tires.find((t) => t.slug === slug);
}

/** Get all unique sizes across all products. */
export function getAllSizes(): string[] {
  const sizes = new Set<string>();
  tires.forEach((tire) => tire.sizes.forEach((s) => sizes.add(s)));
  return [...sizes].sort();
}
`;

writeFileSync(join(ROOT, 'src/data/mock-tires.ts'), output, 'utf-8');
console.log(`Generated mock-tires.ts with ${picks.length} products, ${industries.length} industries, ${applications.length} applications`);
