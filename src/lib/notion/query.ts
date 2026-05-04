/**
 * Notion data-source query helpers.
 *
 * Notion's data sources are paginated 100 rows at a time. We always want
 * the full set, so this helper hides the cursor loop.
 */
import { notion } from './client.js';

export async function queryAllPages(dataSourceId: string, filter?: any): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
      ...(filter ? { filter } : {}),
    });
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
    const res: any = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
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
