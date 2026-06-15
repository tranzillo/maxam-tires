import { getConnection } from './db.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, 'output');

export interface SpecTable {
  tableId: string;
  title: string;
  headers: string[];
  rows: string[][];
}

/**
 * Extract all TablePress tables and return a map of table ID → parsed table data.
 */
export async function extractTablePressTables(): Promise<Map<string, SpecTable>> {
  const db = await getConnection();

  // Get the table ID → post ID mapping from wp_options
  const [optRows] = await db.query(
    `SELECT option_value FROM wp_options WHERE option_name = 'tablepress_tables'`
  );
  const optValue = (optRows as any[])[0]?.option_value;
  if (!optValue) {
    console.log('⚠ No tablepress_tables option found');
    await db.end();
    return new Map();
  }

  // Parse the JSON mapping: { "table_id": post_id, ... }
  // TablePress stores this as a serialized PHP array or JSON
  let tableMapping: Record<string, number> = {};
  try {
    const parsed = JSON.parse(optValue);
    // The format is: { table_post: { "1": 123, "2": 456, ... }, ... }
    if (parsed.table_post) {
      tableMapping = parsed.table_post;
    } else {
      tableMapping = parsed;
    }
  } catch {
    console.log('⚠ Could not parse tablepress_tables option — trying PHP serialized format');
    // If it's PHP serialized, we'll query posts directly instead
  }

  // Get all TablePress table posts
  const [tablePosts] = await db.query(
    `SELECT ID, post_title, post_content, post_excerpt
     FROM wp_posts
     WHERE post_type = 'tablepress_table'`
  );

  const tables = new Map<string, SpecTable>();

  // Build reverse mapping: post_id → table_id
  const postIdToTableId = new Map<number, string>();
  for (const [tableId, postId] of Object.entries(tableMapping)) {
    postIdToTableId.set(Number(postId), tableId);
  }

  for (const post of tablePosts as any[]) {
    const tableId = postIdToTableId.get(post.ID) ?? String(post.ID);

    try {
      const data = JSON.parse(post.post_content);
      if (!Array.isArray(data) || data.length === 0) continue;

      // First row is headers, rest are data rows
      const headers = data[0] as string[];
      const rows = data.slice(1) as string[][];

      tables.set(tableId, {
        tableId,
        title: post.post_title,
        headers,
        rows,
      });
    } catch {
      console.log(`⚠ Could not parse table ${tableId} (post ${post.ID})`);
    }
  }

  // Write all tables
  const tablesObj = Object.fromEntries(tables);
  writeFileSync(join(OUT, 'tablepress-tables.json'), JSON.stringify(tablesObj, null, 2));
  console.log(`✓ Extracted ${tables.size} TablePress tables`);

  await db.end();
  return tables;
}
