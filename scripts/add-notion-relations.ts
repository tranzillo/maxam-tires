/**
 * Add relation properties across all Notion databases.
 *
 * Each database gets a `Translations` self-relation so editors can hop
 * between language siblings. The Products database additionally gets
 * `Industries`, `Applications`, and `Tire Type` relations into the
 * taxonomy databases (replacing the previous multi-select / select fields).
 *
 * Idempotent — running again is safe.
 *
 * Usage:
 *   npx tsx scripts/add-notion-relations.ts
 */
import { notion } from './notion-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const ids = JSON.parse(
  readFileSync(join(import.meta.dirname, 'output', 'notion-ids.json'), 'utf8')
);

interface DBSchemaUpdate {
  label: string;
  dataSourceId: string;
  properties: Record<string, any>;
}

const updates: DBSchemaUpdate[] = [
  {
    label: 'Industries',
    dataSourceId: ids.industriesDataSourceId,
    properties: {
      Translations: {
        relation: {
          data_source_id: ids.industriesDataSourceId,
          single_property: {},
        },
      },
    },
  },
  {
    label: 'Applications',
    dataSourceId: ids.applicationsDataSourceId,
    properties: {
      Translations: {
        relation: {
          data_source_id: ids.applicationsDataSourceId,
          single_property: {},
        },
      },
    },
  },
  {
    label: 'Tire Types',
    dataSourceId: ids.tireTypesDataSourceId,
    properties: {
      Translations: {
        relation: {
          data_source_id: ids.tireTypesDataSourceId,
          single_property: {},
        },
      },
    },
  },
  {
    label: 'Products',
    dataSourceId: ids.productsDataSourceId,
    properties: {
      Translations: {
        relation: {
          data_source_id: ids.productsDataSourceId,
          single_property: {},
        },
      },
      // Replace multi-selects with relations into taxonomy databases.
      // Notion preserves the existing property value type if same name —
      // sending a different config converts the property in place.
      Industries: {
        relation: {
          data_source_id: ids.industriesDataSourceId,
          single_property: {},
        },
      },
      Applications: {
        relation: {
          data_source_id: ids.applicationsDataSourceId,
          single_property: {},
        },
      },
      'Tire Type': {
        relation: {
          data_source_id: ids.tireTypesDataSourceId,
          single_property: {},
        },
      },
    },
  },
];

async function main() {
  for (const u of updates) {
    if (!u.dataSourceId) {
      console.error(`✗ ${u.label}: no data source ID — run create scripts first`);
      continue;
    }
    console.log(`Updating ${u.label} (${u.dataSourceId})`);
    try {
      await (notion as any).dataSources.update({
        data_source_id: u.dataSourceId,
        properties: u.properties,
      });
      console.log(`  ✓ ${Object.keys(u.properties).join(', ')}`);
    } catch (err: any) {
      console.error(`  ✗ ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
