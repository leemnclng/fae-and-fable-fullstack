import { prepareSql } from './pg.js';

it('numbers placeholders and qualifies the schema', () => {
  expect(prepareSql('SELECT * FROM $s.events WHERE id = ? AND slug = ?', 'fae_fable')).toBe(
    'SELECT * FROM "fae_fable".events WHERE id = $1 AND slug = $2',
  );
  expect(prepareSql('CREATE SCHEMA IF NOT EXISTS $s;', 'fae_fable')).toBe('CREATE SCHEMA IF NOT EXISTS "fae_fable";');
});

it('leaves question marks inside quoted literals alone', () => {
  expect(prepareSql("SELECT '?' AS q, ? AS v", 's')).toBe("SELECT '?' AS q, $1 AS v");
});

it('refuses schema names that are not plain identifiers', async () => {
  const { Pg } = await import('./pg.js');
  const old = process.env.DB_SCHEMA;
  process.env.DB_SCHEMA = 'bad-name; DROP';
  try {
    expect(() => new Pg()).toThrow(/DB_SCHEMA/);
  } finally {
    process.env.DB_SCHEMA = old;
  }
});
