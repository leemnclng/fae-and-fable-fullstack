// `pnpm db:migrate`: brings the configured schema (DB_SCHEMA) up to date and makes sure the storage buckets exist.
// Run locally, or as a release step. Never runs at API startup.
import { migrate } from './migrate.js';
import { Pg } from './pg.js';
import { createFileStore } from './storage/storage.module.js';

const pg = new Pg();
try {
  const applied = await migrate(pg);
  console.log(`[${pg.schema}] ${applied.length ? `applied ${applied.join(', ')}` : 'already up to date'}`);
  await createFileStore().ensureBuckets();
  console.log('storage buckets ready');
} finally {
  await pg.onModuleDestroy();
}
