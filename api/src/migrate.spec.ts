import { freshSchema } from '../test/pg-harness.js';
import { migrate } from './migrate.js';

const TABLES = ['events', 'messages', 'photos', 'products', 'schema_migrations', 'settings', 'showcase_photos', 'showcases'];

it('migrate creates tables only inside the configured schema', async () => {
  const listPublic = async (pg: Awaited<ReturnType<typeof freshSchema>>['pg']) =>
    (await pg.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).map((r) => r.table_name);

  const probe = await freshSchema({ migrate: false });
  const publicBefore = await listPublic(probe.pg);
  await probe.drop();

  const { schema, pg, drop } = await freshSchema();
  try {
    const ours = await pg.query<{ table_name: string }>('SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY 1', [schema]);
    expect(ours.map((r) => r.table_name)).toEqual(TABLES);
    expect(await listPublic(pg)).toEqual(publicBefore);
    expect(await migrate(pg)).toEqual([]);
  } finally {
    await drop();
  }
});
