// `pnpm db:migrate`: brings the configured schema (DB_SCHEMA) up to date. Run locally, or as a deploy step.
import { migrate } from './migrate.js';
import { Pg } from './pg.js';

const pg = new Pg();
try {
  const applied = await migrate(pg);
  console.log(`[${pg.schema}] ${applied.length ? `applied ${applied.join(', ')}` : 'already up to date'}`);
} finally {
  await pg.onModuleDestroy();
}
