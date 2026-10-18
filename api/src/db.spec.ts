import { DatabaseSync } from 'node:sqlite';

Object.assign(process.env, { JWT_SECRET: 'test', ADMIN_EMAIL: 'a@test.dev', ADMIN_PASSWORD: 'pw' });
const { SCHEMA, migrateContent } = await import('./db.js');

it('moves old catalog packages into products and drops portfolio rows', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(SCHEMA);
  sql.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    price TEXT, image TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  sql.exec(`INSERT INTO content (kind, title, description, price, image, sort) VALUES
    ('package', 'Gold', 'd', '₱15,000', 'g.jpg', 2), ('portfolio', 'Old shot', '', NULL, 'p.jpg', 0)`);

  migrateContent(sql);

  const rows = sql.prepare('SELECT draft, published, sort FROM products').all() as { draft: string; published: string; sort: number }[];
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].draft)).toEqual({ name: 'Gold', type: 'package', price: '₱15,000', description: 'd', inclusions: [], photos: ['g.jpg'], visible: true });
  expect(rows[0].published).toBe(rows[0].draft);
  expect(rows[0].sort).toBe(2);
  expect(sql.prepare("SELECT name FROM sqlite_master WHERE name = 'content'").get()).toBeUndefined();
  expect(() => migrateContent(sql)).not.toThrow();
});
