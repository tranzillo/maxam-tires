import { htmlToNotionBlocks } from './html-to-notion.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const articles = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'articles-en.json'), 'utf8')
);

const sample = articles.find((a: any) => a.type === 'blog' && a.bodyHtml.length > 1000);
console.log('Article:', sample.title);
console.log('Body chars:', sample.bodyHtml.length);

const blocks = htmlToNotionBlocks(sample.bodyHtml);
console.log('Blocks produced:', blocks.length);
console.log('Block type breakdown:');
const types: Record<string, number> = {};
for (const b of blocks) types[b.type] = (types[b.type] || 0) + 1;
for (const [t, n] of Object.entries(types)) console.log(`  ${t}: ${n}`);

console.log('\nFirst 5 blocks:');
for (const b of blocks.slice(0, 5)) {
  console.log(JSON.stringify(b, null, 2).slice(0, 500));
}

console.log('\n— Press Release —');
const pr = articles.find((a: any) => a.type === 'press-release');
const prBlocks = htmlToNotionBlocks(pr.bodyHtml);
console.log('Title:', pr.title);
console.log('Block count:', prBlocks.length);
const prTypes: Record<string, number> = {};
for (const b of prBlocks) prTypes[b.type] = (prTypes[b.type] || 0) + 1;
console.log('Types:', prTypes);

console.log('\n— In the News —');
const itn = articles.find((a: any) => a.type === 'in-the-news');
const itnBlocks = htmlToNotionBlocks(itn.bodyHtml);
console.log('Title:', itn.title);
console.log('Body length:', itn.bodyHtml.length);
console.log('Block count:', itnBlocks.length);
