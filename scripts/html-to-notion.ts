/**
 * Convert WordPress HTML article bodies into Notion block JSON.
 *
 * Scope: targets the markup actually present in MAXAM article bodies after
 * unwrapping the ACF Gutenberg block — paragraphs, headings, lists, links,
 * inline emphasis, blockquotes, images, and sectioned wrappers. Falls back
 * gracefully on unknown elements (treats them as inline text or block group).
 */
import { parseFragment } from 'parse5';
import { decodeEntities, rewriteMediaUrl, isValidNotionUrl } from './notion-client.js';

type NotionRichText = any[];
type NotionBlock = any;

interface InlineState {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  link?: string;
}

const INLINE_TAG_HANDLERS: Record<string, (s: InlineState) => InlineState> = {
  strong: (s) => ({ ...s, bold: true }),
  b: (s) => ({ ...s, bold: true }),
  em: (s) => ({ ...s, italic: true }),
  i: (s) => ({ ...s, italic: true }),
  u: (s) => ({ ...s, underline: true }),
  s: (s) => ({ ...s, strikethrough: true }),
  del: (s) => ({ ...s, strikethrough: true }),
  code: (s) => ({ ...s, code: true }),
};

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre',
  'section', 'article', 'div', 'figure', 'aside',
  'img', 'hr', 'table',
]);

function getAttr(node: any, name: string): string | undefined {
  return node.attrs?.find((a: any) => a.name === name)?.value;
}

/** Build a Notion rich_text array from an HTML node's children, applying inline state. */
function collectInline(node: any, state: InlineState = {}): NotionRichText {
  const out: NotionRichText = [];
  for (const child of node.childNodes || []) {
    pushInline(child, state, out);
  }
  return mergeAdjacent(out);
}

function pushInline(node: any, state: InlineState, out: NotionRichText) {
  if (node.nodeName === '#text') {
    const text = decodeEntities(node.value).replace(/ /g, ' ');
    if (!text) return;
    out.push(...makeRichText(text, state));
    return;
  }

  const tag = node.nodeName;

  if (tag === 'a') {
    const href = getAttr(node, 'href');
    const childState: InlineState = { ...state, link: href };
    for (const c of node.childNodes || []) pushInline(c, childState, out);
    return;
  }

  if (tag === 'br') {
    out.push(...makeRichText('\n', state));
    return;
  }

  const handler = INLINE_TAG_HANDLERS[tag];
  if (handler) {
    const newState = handler(state);
    for (const c of node.childNodes || []) pushInline(c, newState, out);
    return;
  }

  // Unknown inline tag: descend, ignore the wrapper.
  for (const c of node.childNodes || []) pushInline(c, state, out);
}

/**
 * Notion rich_text content is capped at 2000 chars per fragment.
 * Stay below to leave headroom for any later concatenation.
 */
const MAX_RICH_TEXT_LEN = 1900;

function makeRichText(content: string, state: InlineState): any[] {
  // Split long content into multiple fragments rather than truncating —
  // truncation silently loses article body text.
  const fragments: any[] = [];
  for (let i = 0; i < content.length; i += MAX_RICH_TEXT_LEN) {
    const slice = content.slice(i, i + MAX_RICH_TEXT_LEN);
    const node: any = {
      type: 'text',
      text: { content: slice },
      annotations: {
        bold: !!state.bold,
        italic: !!state.italic,
        strikethrough: !!state.strikethrough,
        underline: !!state.underline,
        code: !!state.code,
      },
    };
    if (state.link) {
      const fixed = rewriteMediaUrl(state.link);
      // Inline anchor links need a scheme too — drop the link if it's
      // unparseable; the text content still appears as plain text.
      if (isValidNotionUrl(fixed)) node.text.link = { url: fixed };
    }
    fragments.push(node);
  }
  return fragments;
}

/** Merge adjacent rich_text fragments with identical annotations to keep blocks tidy. */
function mergeAdjacent(arr: NotionRichText): NotionRichText {
  const merged: NotionRichText = [];
  for (const item of arr) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.type === 'text' &&
      item.type === 'text' &&
      JSON.stringify(last.annotations) === JSON.stringify(item.annotations) &&
      JSON.stringify(last.text.link) === JSON.stringify(item.text.link)
    ) {
      const combined = last.text.content + item.text.content;
      if (combined.length <= MAX_RICH_TEXT_LEN) {
        last.text.content = combined;
        continue;
      }
    }
    merged.push(item);
  }
  return merged;
}

function paragraph(richText: NotionRichText): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
}

function heading(level: 1 | 2 | 3, richText: NotionRichText): NotionBlock {
  const cap = Math.min(level, 3) as 1 | 2 | 3;
  const key = `heading_${cap}` as 'heading_1' | 'heading_2' | 'heading_3';
  return { object: 'block', type: key, [key]: { rich_text: richText } };
}

function bullet(richText: NotionRichText, children?: NotionBlock[]): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: richText, ...(children?.length ? { children } : {}) },
  };
}

function numbered(richText: NotionRichText, children?: NotionBlock[]): NotionBlock {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: { rich_text: richText, ...(children?.length ? { children } : {}) },
  };
}

function quote(richText: NotionRichText): NotionBlock {
  return { object: 'block', type: 'quote', quote: { rich_text: richText } };
}

function divider(): NotionBlock {
  return { object: 'block', type: 'divider', divider: {} };
}

function imageBlock(url: string): NotionBlock | null {
  const fixed = rewriteMediaUrl(url);
  if (!isValidNotionUrl(fixed)) return null;
  return {
    object: 'block',
    type: 'image',
    image: { type: 'external', external: { url: fixed } },
  };
}

function code(content: string, language = 'plain text'): NotionBlock {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: content.slice(0, 1900) } }],
      language,
    },
  };
}

/** Convert an HTML element subtree into Notion blocks. */
function convertNode(node: any): NotionBlock[] {
  const tag = node.nodeName;

  // Text node at block level: wrap in paragraph if it has content.
  if (tag === '#text') {
    const text = decodeEntities(node.value).trim();
    if (!text) return [];
    return [paragraph(makeRichText(text, {}))];
  }

  switch (tag) {
    case 'p': {
      const rt = collectInline(node);
      if (rt.length === 0) return [];
      return [paragraph(rt)];
    }
    case 'h1':
      return [heading(1, collectInline(node))];
    case 'h2':
      return [heading(2, collectInline(node))];
    case 'h3':
      return [heading(3, collectInline(node))];
    case 'h4':
    case 'h5':
    case 'h6':
      return [heading(3, collectInline(node))];
    case 'ul': {
      const items: NotionBlock[] = [];
      for (const li of node.childNodes || []) {
        if (li.nodeName !== 'li') continue;
        items.push(bullet(collectInline(li), nestedListChildren(li)));
      }
      return items;
    }
    case 'ol': {
      const items: NotionBlock[] = [];
      for (const li of node.childNodes || []) {
        if (li.nodeName !== 'li') continue;
        items.push(numbered(collectInline(li), nestedListChildren(li)));
      }
      return items;
    }
    case 'blockquote':
      return [quote(collectInline(node))];
    case 'pre': {
      const text = textContent(node);
      if (!text.trim()) return [];
      return [code(text)];
    }
    case 'hr':
      return [divider()];
    case 'img': {
      const src = getAttr(node, 'src');
      const blk = src ? imageBlock(src) : null;
      return blk ? [blk] : [];
    }
    case 'figure': {
      // Treat <figure> like a flat container — recurse into children.
      const out: NotionBlock[] = [];
      for (const c of node.childNodes || []) out.push(...convertNode(c));
      return out;
    }
    case 'section':
    case 'article':
    case 'div':
    case 'aside':
    case 'main': {
      // Wrappers — flatten.
      const out: NotionBlock[] = [];
      for (const c of node.childNodes || []) out.push(...convertNode(c));
      return out;
    }
    case 'table':
      // Article tables are rare and small; emit a placeholder paragraph noting the
      // table existed. We can revisit if real cases appear.
      return [paragraph([{ type: 'text', text: { content: '[table content omitted]' }, annotations: { italic: true } }])];
    default: {
      // Unknown block: try to descend; if no children produce blocks, treat as paragraph.
      const out: NotionBlock[] = [];
      for (const c of node.childNodes || []) out.push(...convertNode(c));
      if (out.length > 0) return out;
      const rt = collectInline(node);
      return rt.length > 0 ? [paragraph(rt)] : [];
    }
  }
}

function nestedListChildren(li: any): NotionBlock[] {
  // If a list item contains a nested <ul> or <ol>, those become children.
  const nested: NotionBlock[] = [];
  for (const c of li.childNodes || []) {
    if (c.nodeName === 'ul' || c.nodeName === 'ol') {
      nested.push(...convertNode(c));
    }
  }
  return nested;
}

function textContent(node: any): string {
  if (node.nodeName === '#text') return node.value;
  let out = '';
  for (const c of node.childNodes || []) out += textContent(c);
  return out;
}

/**
 * Public API: convert a string of HTML into an array of Notion block objects.
 */
export function htmlToNotionBlocks(html: string): NotionBlock[] {
  if (!html || !html.trim()) return [];
  const doc = parseFragment(html);
  const blocks: NotionBlock[] = [];

  // Loose text at the top level needs to be coalesced into paragraphs.
  let textBuffer: any[] = [];
  const flushTextBuffer = () => {
    if (textBuffer.length > 0) {
      const merged = mergeAdjacent(textBuffer);
      if (merged.length > 0) blocks.push(paragraph(merged));
      textBuffer = [];
    }
  };

  for (const child of doc.childNodes || []) {
    const tag = child.nodeName;
    // Inline text/tags at top level → buffer into a paragraph.
    if (tag === '#text') {
      const text = decodeEntities((child as any).value).replace(/ /g, ' ');
      if (text.trim()) textBuffer.push(...makeRichText(text, {}));
      continue;
    }
    if (!BLOCK_TAGS.has(tag) && !['ul', 'ol'].includes(tag)) {
      // Inline element at top level → buffer.
      pushInline(child, {}, textBuffer);
      continue;
    }
    flushTextBuffer();
    blocks.push(...convertNode(child));
  }
  flushTextBuffer();

  // Drop empty paragraphs.
  return blocks.filter((b) => {
    if (b.type === 'paragraph') {
      const rt = b.paragraph.rich_text;
      if (!rt || rt.length === 0) return false;
      const hasText = rt.some((t: any) => t.text?.content?.trim());
      return hasText;
    }
    return true;
  });
}
