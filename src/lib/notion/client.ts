/**
 * Notion SDK singleton + database ID lookup.
 *
 * Used by the build-time sync script (scripts/sync-from-notion.ts) — NOT
 * imported by Astro pages directly. Runtime data flows through JSON
 * snapshots in src/data/notion-content/, never hits the Notion API.
 */
import { Client } from '@notionhq/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load .env on first import — this module is only used by build-time scripts,
// not by Astro runtime, so it's safe to read the file directly.
function loadEnv() {
  if (process.env.NOTION_TOKEN) return;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const token = process.env.NOTION_TOKEN;
if (!token) {
  throw new Error('NOTION_TOKEN is not set — required for sync-from-notion');
}

export const notion = new Client({ auth: token });

interface NotionIds {
  productsDataSourceId: string;
  industriesDataSourceId: string;
  applicationsDataSourceId: string;
  tireTypesDataSourceId: string;
  articlesDataSourceId: string;
  eventsDataSourceId: string;
  documentsDataSourceId: string;
  testimonialsDataSourceId: string;
}

/**
 * The sync script lives outside the project; it writes notion-ids.json into
 * scripts/output/. Read it lazily so the file is allowed to not exist for
 * non-sync invocations (e.g. during normal Astro builds with a cached snapshot).
 */
let _ids: NotionIds | null = null;
export function getNotionIds(): NotionIds {
  if (_ids) return _ids;
  const path = join(process.cwd(), 'scripts', 'output', 'notion-ids.json');
  _ids = JSON.parse(readFileSync(path, 'utf8')) as NotionIds;
  return _ids;
}
