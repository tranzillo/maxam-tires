import { htmlToNotionBlocks } from './html-to-notion.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const en = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'articles-en.json'), 'utf8')
);
const a = en.find((x: any) => x.title.startsWith('Lower Air Pressure'));
console.log('Article:', a.title);
const blocks = htmlToNotionBlocks(a.bodyHtml);
let max = 0;
for (const b of blocks) {
  if (b.type === 'paragraph') {
    for (const t of b.paragraph.rich_text || []) {
      const len = t.text?.content?.length ?? 0;
      if (len > max) max = len;
    }
  }
}
console.log('Longest rich_text fragment after fix:', max);
console.log('Total blocks:', blocks.length);
