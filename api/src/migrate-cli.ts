// `pnpm db:migrate`: brings the configured schema (DB_SCHEMA) up to date. Never runs at API startup.
// `pnpm db:bootstrap`: the same, then makes sure the storage buckets exist; for local setup and once per new Supabase project.
// `pnpm db:migrate:deploy`: Vercel's build step (api/vercel.json); migrates only production builds, so previews never touch the live database.
const args = process.argv.slice(2);
if (args.includes('--production-only') && process.env.VERCEL_ENV !== 'production') {
  console.log(`Skipping migrations: VERCEL_ENV is "${process.env.VERCEL_ENV ?? ''}", not "production".`);
  process.exit(0);
}

// Imported after the check: loading config requires the database env vars, which preview builds may not have
const { migrate } = await import('./migrate.js');
const { Pg } = await import('./pg.js');
const { createFileStore } = await import('./storage/storage.module.js');

const pg = new Pg();
try {
  const applied = await migrate(pg);
  console.log(`[${pg.schema}] ${applied.length ? `applied ${applied.join(', ')}` : 'already up to date'}`);
  if (args.includes('--bootstrap')) {
    await createFileStore().ensureBuckets();
    console.log('storage buckets ready');
  }
} finally {
  await pg.onModuleDestroy();
}
