/**
 * Notion data-source query helpers.
 *
 * Notion's data sources are paginated 100 rows at a time. We always want
 * the full set, so this helper hides the cursor loop.
 */
import { notion } from './client.js';

/**
 * Retry a Notion API call on transient failures (timeouts, rate limits, 5xx).
 * The full multi-language sync makes thousands of block requests; a single
 * transient timeout would otherwise abort the whole run. Exponential backoff,
 * a few attempts, then rethrow.
 */
async function withRetry<T>(fn: () => Promise<T>, label = 'notion call'): Promise<T> {
  const MAX = 5;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const code = err?.code ?? '';
      const status = err?.status ?? 0;
      const transient =
        code === 'notionhq_client_request_timeout' ||
        code === 'rate_limited' ||
        code === 'service_unavailable' ||
        code === 'internal_server_error' ||
        status === 429 ||
        status >= 500 ||
        /timed out|ETIMEDOUT|ECONNRESET|socket hang up/i.test(err?.message ?? '');
      if (!transient || attempt === MAX) throw err;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15000);
      console.warn(`  ⟳ ${label} failed (${code || status || err?.message}); retry ${attempt}/${MAX - 1} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function queryAllPages(dataSourceId: string, filter?: any): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(
      () =>
        (notion as any).dataSources.query({
          data_source_id: dataSourceId,
          start_cursor: cursor,
          page_size: 100,
          ...(filter ? { filter } : {}),
        }),
      'dataSources.query'
    );
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * Fetch every block (and recursively its children) for a Notion page.
 * Used to render article/product page bodies. Notion stores blocks as a
 * flat list with parent → children references; tables, columns, and toggles
 * have meaningful children we need to walk.
 */
export async function fetchPageBlocks(pageId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await withRetry(
      () =>
        notion.blocks.children.list({
          block_id: pageId,
          start_cursor: cursor,
          page_size: 100,
        }),
      'blocks.children.list'
    );
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // Recurse into blocks that hold structural children (tables, toggles, callouts).
  for (const block of blocks) {
    if (block.has_children && shouldRecurse(block.type)) {
      block.children = await fetchPageBlocks(block.id);
    }
  }
  return blocks;
}

function shouldRecurse(type: string): boolean {
  return [
    'table',
    'toggle',
    'callout',
    'column_list',
    'column',
    'bulleted_list_item',
    'numbered_list_item',
    'quote',
    'synced_block',
  ].includes(type);
}
