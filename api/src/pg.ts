import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { config } from './config.js';

// COUNT(*) and other int8 results arrive as strings by default; every count here fits in a JS number.
pg.types.setTypeParser(20, Number);

const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Lets SQL keep sqlite-style `?` placeholders and name the schema as `$s`:
 * `?` becomes `$1..$n` (outside quoted literals) and `$s` becomes the quoted schema.
 * Every query names its schema explicitly because pooled serverless connections don't keep `search_path`.
 */
export function prepareSql(sql: string, schema: string): string {
  let out = '';
  let n = 0;
  let quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") quoted = !quoted; // '' (escaped quote) toggles twice, so it stays balanced
    if (!quoted && c === '?') out += `$${++n}`;
    else if (!quoted && c === '$' && sql[i + 1] === 's' && !/\w/.test(sql[i + 2] ?? '')) {
      out += `"${schema}"`;
      i++;
    } else out += c;
  }
  return out;
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<pg.QueryResult> };
export type PgQuery = Pick<Pg, 'query' | 'one' | 'exec'>;

/** Postgres access for the whole API. The schema comes from DB_SCHEMA when constructed, so tests can pick a throwaway one. */
@Injectable()
export class Pg implements OnModuleDestroy {
  readonly schema: string;
  private readonly pool: pg.Pool;

  constructor() {
    this.schema = process.env.DB_SCHEMA || 'fae_fable';
    if (!IDENT.test(this.schema)) throw new Error(`DB_SCHEMA must be a plain lowercase identifier, got "${this.schema}"`);
    // Small pool: serverless instances each hold their own, and the Supabase pooler sits in front
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
    // Dropped idle connections (pooler restarts, network blips) arrive here; unhandled they would crash the process.
    // The pool replaces the client on the next query, so logging is enough.
    this.pool.on('error', (e) => console.error('Postgres pool error:', e.message));
  }

  query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.run(this.pool, sql, params).then((r) => r.rows as T[]);
  }

  one<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.query<T>(sql, params).then((rows) => rows[0]);
  }

  /** For writes; add `RETURNING id` when the new id is needed. */
  exec(sql: string, params?: unknown[]): Promise<{ rowCount: number; rows: { id: number }[] }> {
    return this.run(this.pool, sql, params).then((r) => ({ rowCount: r.rowCount ?? 0, rows: r.rows as { id: number }[] }));
  }

  async tx<T>(fn: (q: PgQuery) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const q: PgQuery = {
      query: <R>(sql: string, params?: unknown[]) => this.run(client, sql, params).then((r) => r.rows as R[]),
      one: <R>(sql: string, params?: unknown[]) => this.run(client, sql, params).then((r) => r.rows[0] as R | undefined),
      exec: (sql: string, params?: unknown[]) => this.run(client, sql, params).then((r) => ({ rowCount: r.rowCount ?? 0, rows: r.rows as { id: number }[] })),
    };
    try {
      await client.query('BEGIN');
      const result = await fn(q);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private run(target: Queryable, sql: string, params?: unknown[]) {
    return target.query(prepareSql(sql, this.schema), params);
  }
}
