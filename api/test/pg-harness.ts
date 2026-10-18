import { randomBytes } from 'node:crypto';
import { migrate } from '../src/migrate.js';
import { Pg } from '../src/pg.js';

/**
 * A throwaway schema on the local Postgres for one test file: sets DB_SCHEMA (so Pg instances created after this use it),
 * runs migrations, and returns a drop() for teardown. Only ever touches fae_fable_test_* schemas.
 */
export async function freshSchema({ migrate: run = true } = {}) {
  const schema = `fae_fable_test_${randomBytes(4).toString('hex')}`;
  process.env.DB_SCHEMA = schema;
  const pg = new Pg();
  if (run) await migrate(pg);
  else await pg.exec('CREATE SCHEMA IF NOT EXISTS $s');
  return {
    schema,
    pg,
    drop: async () => {
      if (!pg.schema.startsWith('fae_fable_test_')) throw new Error(`refusing to drop ${pg.schema}`);
      await pg.exec('DROP SCHEMA IF EXISTS $s CASCADE');
      await pg.onModuleDestroy();
    },
  };
}
