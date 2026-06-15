import { Client } from '@notionhq/client';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(import.meta.dirname, '..', '.env') });

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!token) throw new Error('NOTION_TOKEN missing in .env');
if (!parentPageId) throw new Error('NOTION_PARENT_PAGE_ID missing in .env');

export const notion = new Client({ auth: token });
export const PARENT_PAGE_ID = parentPageId;

/**
 * Decode common HTML entities that came through from WordPress.
 * WP stores `&amp;`, `&#8217;`, etc. literally in some title/term fields.
 */
export function decodeEntities(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Rewrite WordPress media URLs to the production CDN host so Notion
 * (and the live site, eventually) can resolve them.
 * Local DB still references the dev origins; we'll fix this for real
 * before launch by re-hosting media or updating WP options.
 */
const MEDIA_HOST_REWRITES: Array<[RegExp, string]> = [
  [/^http:\/\/localhost:\d+/i, 'https://maxamtire.com'],
  [/^https?:\/\/maxam\.wpengine\.com/i, 'https://maxamtire.com'],
];

export function rewriteMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  let out = url.trim();
  // Protocol-relative (//host/path) → https://host/path
  if (out.startsWith('//')) out = 'https:' + out;
  // Root-relative (/wp-content/...) → maxamtire.com origin
  if (out.startsWith('/') && !out.startsWith('//')) out = 'https://maxamtire.com' + out;
  for (const [pattern, replacement] of MEDIA_HOST_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Notion's image block requires a real URL with http/https scheme.
 * Returns false for URLs Notion will reject.
 */
export function isValidNotionUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /^https?:\/\/.+/i.test(url);
}
