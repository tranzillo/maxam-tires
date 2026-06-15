import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);
const db: any = await notion.databases.retrieve({ database_id: ids.productsDbId });
console.log('Title:', JSON.stringify(db.title));
console.log('Properties:', Object.keys(db.properties || {}));
console.log('Data sources:', JSON.stringify(db.data_sources, null, 2));
