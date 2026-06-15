import { getConnection } from './db.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

/**
 * Extract tire posts with all ACF fields, taxonomies, gallery images,
 * features, and document relations.
 *
 * Pass an array of post IDs to extract specific tires,
 * or omit and pass `language` to get all tires for a WPML language code (default 'en').
 */
export async function extractTires(postIds?: number[], language: string = 'en') {
  const db = await getConnection();

  // ── Get tire posts ────────────────────────────────────────
  // Join wp_icl_translations so we only pull posts in the requested language —
  // WPML stores each translation as its own `tire` post, so without this filter
  // every locale gets mixed into the English result.
  let whereClause = `p.post_type = 'tire' AND p.post_status = 'publish' AND ic.language_code = ?`;
  const params: any[] = [language];

  if (postIds && postIds.length > 0) {
    whereClause += ` AND p.ID IN (${postIds.map(() => '?').join(',')})`;
    params.push(...postIds);
  }

  const [posts] = await db.query(
    `SELECT p.ID, p.post_title, p.post_name AS slug, p.post_content, ic.trid, ic.language_code
     FROM wp_posts p
     JOIN wp_icl_translations ic
       ON ic.element_id = p.ID
       AND ic.element_type = 'post_tire'
     WHERE ${whereClause}
     ORDER BY p.post_title`,
    params
  );

  const tires: any[] = [];

  for (const post of posts as any[]) {
    const tire: any = {
      wpId: post.ID,
      trid: post.trid,
      language: post.language_code,
      title: post.post_title,
      slug: post.slug,
      content: post.post_content,
    };

    // ── ACF scalar fields ─────────────────────────────────
    const [meta] = await db.query(
      `SELECT meta_key, meta_value FROM wp_postmeta WHERE post_id = ?`,
      [post.ID]
    );
    const metaMap = new Map<string, string>();
    for (const m of meta as any[]) {
      metaMap.set(m.meta_key, m.meta_value);
    }

    tire.subheading = metaMap.get('subheading') ?? '';
    tire.details = metaMap.get('details') ?? '';
    tire.additionalDetails = metaMap.get('additional_details') ?? '';
    tire.rating = parseInt(metaMap.get('rating') ?? '0', 10) || 0;
    tire.tablepressTableId = metaMap.get('tire_specifications_table') ?? null;

    // Special logo (attachment ID → URL)
    const specialLogoId = metaMap.get('special_logo');
    if (specialLogoId) {
      const [logoRows] = await db.query(
        `SELECT guid FROM wp_posts WHERE ID = ?`,
        [specialLogoId]
      );
      tire.specialLogo = (logoRows as any[])[0]?.guid ?? null;
    }

    // ── Gallery images (ACF repeater) ─────────────────────
    const galleryCount = parseInt(metaMap.get('tire_gallery_images') ?? '0', 10);
    tire.galleryImages = [];
    for (let i = 0; i < galleryCount; i++) {
      const imgId = metaMap.get(`tire_gallery_images_${i}_image`);
      if (imgId) {
        const [imgRows] = await db.query(
          `SELECT guid FROM wp_posts WHERE ID = ?`,
          [imgId]
        );
        const url = (imgRows as any[])[0]?.guid;
        if (url) tire.galleryImages.push(url);
      }
    }

    // ── Features (ACF repeater) ───────────────────────────
    const featureCount = parseInt(metaMap.get('features') ?? '0', 10);
    tire.features = [];
    for (let i = 0; i < featureCount; i++) {
      const feat = metaMap.get(`features_${i}_feature`);
      if (feat) tire.features.push(feat);
    }

    // ── Taxonomies ────────────────────────────────────────
    // Pull the WPML trid for each term so the Notion importer can resolve the
    // relation target language-agnostically (one trid → one logical category).
    const [taxTerms] = await db.query(
      `SELECT t.name, t.slug, tt.taxonomy, ic.trid
       FROM wp_term_relationships tr
       JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
       JOIN wp_terms t ON tt.term_id = t.term_id
       LEFT JOIN wp_icl_translations ic
         ON ic.element_id = tt.term_taxonomy_id
         AND ic.element_type = CONCAT('tax_', tt.taxonomy)
       WHERE tr.object_id = ?`,
      [post.ID]
    );

    tire.industries = [];
    tire.applications = [];
    tire.tireTypes = [];
    tire.sizes = [];

    for (const term of taxTerms as any[]) {
      const ref = { name: term.name, slug: term.slug, trid: term.trid };
      switch (term.taxonomy) {
        case 'tire-industry':
          tire.industries.push(ref);
          break;
        case 'tire-application':
          tire.applications.push(ref);
          break;
        case 'tire-type':
          tire.tireTypes.push(ref);
          break;
        case 'tire-size':
          tire.sizes.push(term.name);
          break;
      }
    }

    // ── Related documents ─────────────────────────────────
    // The `tire_documents` ACF field is a PHP-serialized array of post IDs,
    // not a repeater. Format: a:N:{i:0;s:4:"9853";i:1;s:5:"34792";...}
    // Pull every quoted string between i:N;s:M:"VALUE"; entries.
    tire.documents = [];
    const serialized = metaMap.get('tire_documents');
    if (serialized) {
      const docIds = [...serialized.matchAll(/i:\d+;s:\d+:"(\d+)"/g)].map((m) => m[1]);
      for (const docId of docIds) {
        const [docRows] = await db.query(
          `SELECT p.ID, p.post_title, p.post_type FROM wp_posts p WHERE p.ID = ?`,
          [docId]
        );
        const doc = (docRows as any[])[0];
        if (!doc) continue;
        tire.documents.push({
          wpId: doc.ID,
          title: doc.post_title,
          type: doc.post_type,
        });
      }
    }

    // Featured image
    const thumbnailId = metaMap.get('_thumbnail_id');
    if (thumbnailId) {
      const [thumbRows] = await db.query(
        `SELECT guid FROM wp_posts WHERE ID = ?`,
        [thumbnailId]
      );
      tire.featuredImage = (thumbRows as any[])[0]?.guid ?? null;
    }

    tires.push(tire);
  }

  await db.end();
  return tires;
}

/**
 * Extract all published tires for one WPML language code and write to JSON.
 * Default is English. Locale code in the filename matches the language argument.
 */
export async function extractAndSaveTires(language: string = 'en') {
  const tires = await extractTires(undefined, language);
  writeFileSync(join(OUT, `tires-${language}.json`), JSON.stringify(tires, null, 2));
  console.log(`✓ Extracted ${tires.length} tires for ${language}`);
  return tires;
}
