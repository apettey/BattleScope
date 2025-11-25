import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { Database } from './types';
import { config } from '../config';

let db: Kysely<Database> | null = null;

export function createDatabase(): Kysely<Database> {
  if (db) {
    return db;
  }

  const dialect = new PostgresDialect({
    pool: new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 10,
    }),
  });

  db = new Kysely<Database>({
    dialect,
  });

  return db;
}

export function getDatabase(): Kysely<Database> {
  if (!db) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
