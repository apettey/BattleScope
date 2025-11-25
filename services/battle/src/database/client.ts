import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './types';

let db: Kysely<Database> | null = null;
let pool: Pool | null = null;

export function getDatabase(): Kysely<Database> {
  if (!db) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'battlescope_battles',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}
