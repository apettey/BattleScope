import { createDatabase, getDatabaseConfigFromEnv } from '@battlescope/database';
import type { Kysely } from 'kysely';
import type { Database } from './types';

let db: Kysely<Database> | null = null;

export function getDatabase(): Kysely<Database> {
  if (!db) {
    const config = getDatabaseConfigFromEnv();
    db = createDatabase<Database>(config);
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
