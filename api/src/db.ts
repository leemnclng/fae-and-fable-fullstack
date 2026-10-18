import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { Pg } from './pg.js';

export const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sort INTEGER NOT NULL DEFAULT 0,
  draft TEXT NOT NULL,
  published TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  event_date TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  passcode TEXT NOT NULL,
  client_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS showcases (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS showcase_photos (
  id INTEGER PRIMARY KEY,
  showcase_id INTEGER NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

/** One-off upgrade: the old `content` table's packages become published products; portfolio rows are dropped. */
export function migrateContent(sql: DatabaseSync) {
  if (!sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'content'").get()) return;
  const rows = sql.prepare("SELECT * FROM content WHERE kind = 'package' ORDER BY sort, id").all() as {
    title: string; description: string; price: string | null; image: string | null; sort: number;
  }[];
  const insert = sql.prepare('INSERT INTO products (sort, draft, published) VALUES (?, ?, ?)');
  sql.exec('BEGIN');
  try {
    for (const r of rows) {
      const data = JSON.stringify({ name: r.title, type: 'package', price: r.price ?? '', description: r.description, inclusions: [], photos: r.image ? [r.image] : [], visible: true });
      insert.run(r.sort, data, data);
    }
    sql.exec('DROP TABLE content');
    sql.exec('COMMIT');
  } catch (e) {
    sql.exec('ROLLBACK');
    throw e;
  }
}

// shortcut: single-file SQLite on local disk, move to Postgres + object storage when running more than one API instance
@Injectable()
export class Db implements OnModuleDestroy {
  readonly sql: DatabaseSync;

  constructor() {
    mkdirSync(config.dataDir, { recursive: true });
    this.sql = new DatabaseSync(join(config.dataDir, 'app.db'));
    this.sql.exec(SCHEMA);
    migrateContent(this.sql);
    // Columns added after launch; ALTER only when missing so existing databases upgrade in place.
    const cols = (this.sql.prepare('PRAGMA table_info(events)').all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes('is_public')) this.sql.exec('ALTER TABLE events ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0');
    if (!cols.includes('client_code')) this.sql.exec('ALTER TABLE events ADD COLUMN client_code TEXT');
    if (!cols.includes('design')) this.sql.exec('ALTER TABLE events ADD COLUMN design TEXT');
    const photoCols = (this.sql.prepare('PRAGMA table_info(photos)').all() as { name: string }[]).map((c) => c.name);
    if (!photoCols.includes('guest_name')) this.sql.exec('ALTER TABLE photos ADD COLUMN guest_name TEXT');
    if (!photoCols.includes('message_id')) {
      this.sql.exec('ALTER TABLE photos ADD COLUMN message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL');
    }
  }

  onModuleDestroy() {
    this.sql.close();
  }
}

@Global()
@Module({ providers: [Db, Pg], exports: [Db, Pg] })
export class DbModule {}
