import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pg } from './pg.js';

// api/migrations, whether this runs from src/ (tests) or dist/ (built CLI)
const DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Applies pending migrations in file-name order, each in its own transaction. Returns the names applied. Never called at startup. */
export async function migrate(pg: Pg): Promise<string[]> {
  await pg.exec('CREATE SCHEMA IF NOT EXISTS $s');
  await pg.exec('CREATE TABLE IF NOT EXISTS $s.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pg.query<{ name: string }>('SELECT name FROM $s.schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await pg.tx(async (q) => {
      await q.exec(readFileSync(DIR + file, 'utf8'));
      await q.exec('INSERT INTO $s.schema_migrations (name) VALUES (?)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
